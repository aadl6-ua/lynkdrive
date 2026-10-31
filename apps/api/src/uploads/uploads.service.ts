import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import type { UploadImageResponse, UploadTarget } from '@lynkdrive/shared';

type UploadResult = UploadImageResponse;

type TargetConfig = {
  bucket: string;
  isPublicBucket: boolean;
  maxSizeBytes: number;
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly supabaseUrl = process.env.SUPABASE_URL;
  private readonly supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  private readonly signedUrlTtlSeconds = this.parsePositiveInt(
    process.env.SUPABASE_SIGNED_URL_TTL_SECONDS,
    3600
  );

  async uploadImage(
    target: UploadTarget,
    userId: string,
    ownerId: string | undefined,
    file: Express.Multer.File
  ): Promise<UploadResult> {
    if (!this.supabaseUrl || !this.supabaseServiceRoleKey) {
      throw new InternalServerErrorException(
        'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para subir archivos'
      );
    }

    if (!file) {
      throw new BadRequestException('Debes enviar un archivo en el campo file');
    }

    const declaredMimeType = file.mimetype?.toLowerCase() ?? '';

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(declaredMimeType)) {
      throw new BadRequestException('Tipo de archivo no permitido. Usa jpeg, png o webp');
    }

    // El tipo real se obtiene de los bytes del archivo, no de la cabecera enviada por el cliente.
    const mimeType = file.buffer ? this.detectImageMimeType(file.buffer) : null;

    if (!mimeType) {
      throw new BadRequestException('El contenido del archivo no corresponde a una imagen valida');
    }

    const targetConfig = this.resolveTargetConfig(target);

    if (file.size > targetConfig.maxSizeBytes) {
      throw new BadRequestException(`El archivo supera el limite permitido para ${target}`);
    }

    const extension = this.resolveFileExtension(mimeType);
    // La carpeta raiz siempre es el usuario autenticado; ownerId solo agrupa dentro de ella.
    const userSegment = this.sanitizePathSegment(userId);
    const ownerSegment = ownerId ? this.sanitizePathSegment(ownerId).slice(0, 64) : null;
    const targetSegment = this.sanitizePathSegment(target);
    const uniqueName = `${Date.now()}-${randomUUID()}.${extension}`;
    const path = ownerSegment && ownerSegment !== userSegment
      ? `${targetSegment}/${userSegment}/${ownerSegment}/${uniqueName}`
      : `${targetSegment}/${userSegment}/${uniqueName}`;

    const supabase = createClient(this.supabaseUrl, this.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });

    const { error: uploadError } = await supabase.storage.from(targetConfig.bucket).upload(path, file.buffer, {
      contentType: mimeType,
      upsert: false
    });

    if (uploadError) {
      this.logger.error(`Error al subir archivo a storage: ${uploadError.message}`);
      throw new InternalServerErrorException('Error al subir archivo');
    }

    const persistedValue = `supabase://${targetConfig.bucket}/${path}`;
    let publicUrl: string | null = null;
    let signedUrl: string | null = null;

    if (targetConfig.isPublicBucket) {
      const { data } = supabase.storage.from(targetConfig.bucket).getPublicUrl(path);

      if (!data?.publicUrl) {
        throw new InternalServerErrorException('No se pudo generar URL publica del archivo');
      }

      publicUrl = data.publicUrl;
    } else {
      const { data, error } = await supabase.storage
        .from(targetConfig.bucket)
        .createSignedUrl(path, this.signedUrlTtlSeconds);

      if (error || !data?.signedUrl) {
        throw new InternalServerErrorException('No se pudo generar signed URL del archivo');
      }

      signedUrl = data.signedUrl;
    }

    const fileUrl = publicUrl ?? signedUrl;

    if (!fileUrl) {
      throw new InternalServerErrorException('No se pudo generar URL de acceso al archivo');
    }

    return {
      bucket: targetConfig.bucket,
      path,
      publicUrl,
      signedUrl,
      fileUrl,
      persistedValue,
      isPublicBucket: targetConfig.isPublicBucket,
      mimeType,
      sizeBytes: file.size
    };
  }

  private resolveTargetConfig(target: UploadTarget): TargetConfig {
    if (target === 'vehicle_image') {
      return {
        bucket: process.env.SUPABASE_STORAGE_VEHICLES_BUCKET ?? 'vehicles',
        isPublicBucket: this.parseBoolean(process.env.SUPABASE_STORAGE_VEHICLES_PUBLIC, true),
        maxSizeBytes: 2 * 1024 * 1024
      };
    }

    if (target === 'avatar') {
      return {
        bucket: process.env.SUPABASE_STORAGE_AVATARS_BUCKET ?? 'avatars',
        isPublicBucket: this.parseBoolean(process.env.SUPABASE_STORAGE_AVATARS_PUBLIC, true),
        maxSizeBytes: 500 * 1024
      };
    }

    if (target === 'checklist_image') {
      return {
        bucket: process.env.SUPABASE_STORAGE_CHECKLISTS_BUCKET ?? 'checklists',
        isPublicBucket: this.parseBoolean(process.env.SUPABASE_STORAGE_CHECKLISTS_PUBLIC, false),
        maxSizeBytes: 2 * 1024 * 1024
      };
    }

    const docsBucket =
      process.env.SUPABASE_STORAGE_DOCUMENTS_BUCKET ??
      process.env.SUPABASE_STORAGE_USER_DOCS_BUCKET ??
      'documents';

    return {
      bucket: docsBucket,
      isPublicBucket: this.parseBoolean(process.env.SUPABASE_STORAGE_DOCUMENTS_PUBLIC, false),
      maxSizeBytes: 2 * 1024 * 1024
    };
  }

  // La extension se deriva del mime validado, nunca del nombre enviado por el cliente.
  private resolveFileExtension(mimeType: string): string {
    if (mimeType === 'image/png') {
      return 'png';
    }

    if (mimeType === 'image/webp') {
      return 'webp';
    }

    return 'jpg';
  }

  private detectImageMimeType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    if (
      buffer.length > 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }

    if (
      buffer.length > 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    return null;
  }

  private sanitizePathSegment(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (!value) {
      return fallback;
    }

    return ['true', '1', 'yes', 'si'].includes(value.trim().toLowerCase());
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }
}
