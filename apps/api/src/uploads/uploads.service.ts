import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

type UploadTarget =
  | 'avatar'
  | 'id_document'
  | 'driver_license'
  | 'vehicle_image'
  | 'checklist_image';

type UploadResult = {
  bucket: string;
  path: string;
  publicUrl: string | null;
  signedUrl: string | null;
  fileUrl: string;
  persistedValue: string;
  isPublicBucket: boolean;
  mimeType: string;
  sizeBytes: number;
};

type TargetConfig = {
  bucket: string;
  isPublicBucket: boolean;
  maxSizeBytes: number;
};

@Injectable()
export class UploadsService {
  private readonly supabaseUrl = process.env.SUPABASE_URL;
  private readonly supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  private readonly signedUrlTtlSeconds = this.parsePositiveInt(
    process.env.SUPABASE_SIGNED_URL_TTL_SECONDS,
    3600
  );

  async uploadImage(target: UploadTarget, ownerId: string | undefined, file: Express.Multer.File): Promise<UploadResult> {
    if (!this.supabaseUrl || !this.supabaseServiceRoleKey) {
      throw new InternalServerErrorException(
        'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para subir archivos'
      );
    }

    if (!file) {
      throw new BadRequestException('Debes enviar un archivo en el campo file');
    }

    const mimeType = file.mimetype?.toLowerCase() ?? '';

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new BadRequestException('Tipo de archivo no permitido. Usa jpeg, png o webp');
    }

    const targetConfig = this.resolveTargetConfig(target);

    if (file.size > targetConfig.maxSizeBytes) {
      throw new BadRequestException(`El archivo supera el limite permitido para ${target}`);
    }

    const extension = this.resolveFileExtension(file.originalname, mimeType);
    const ownerSegment = this.sanitizePathSegment(ownerId ?? 'anonymous');
    const targetSegment = this.sanitizePathSegment(target);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const path = `${targetSegment}/${ownerSegment}/${uniqueName}`;

    const supabase = createClient(this.supabaseUrl, this.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });

    const { error: uploadError } = await supabase.storage.from(targetConfig.bucket).upload(path, file.buffer, {
      contentType: mimeType,
      upsert: false
    });

    if (uploadError) {
      throw new InternalServerErrorException(`Error al subir archivo: ${uploadError.message}`);
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

  private resolveFileExtension(originalName: string, mimeType: string): string {
    const extensionFromName = originalName.includes('.')
      ? originalName.split('.').pop()?.toLowerCase()
      : undefined;

    if (extensionFromName && ['jpg', 'jpeg', 'png', 'webp'].includes(extensionFromName)) {
      return extensionFromName;
    }

    if (mimeType === 'image/png') {
      return 'png';
    }

    if (mimeType === 'image/webp') {
      return 'webp';
    }

    return 'jpg';
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
