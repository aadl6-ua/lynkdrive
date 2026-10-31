/** Destinos permitidos en `POST /uploads/images/:target`. */
export type UploadTarget = 'avatar' | 'id_document' | 'driver_license' | 'vehicle_image' | 'checklist_image';

export const UPLOAD_TARGETS: readonly UploadTarget[] = [
  'avatar',
  'id_document',
  'driver_license',
  'vehicle_image',
  'checklist_image'
];

/**
 * Respuesta de subida. Se persiste siempre `persistedValue`; `fileUrl` solo
 * sirve para previsualizar (es temporal si el bucket es privado).
 */
export interface UploadImageResponse {
  bucket: string;
  path: string;
  publicUrl: string | null;
  signedUrl: string | null;
  fileUrl: string;
  persistedValue: string;
  isPublicBucket: boolean;
  mimeType: string;
  sizeBytes: number;
}
