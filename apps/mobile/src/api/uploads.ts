import { httpClient } from './http';

export type UploadTarget =
  | 'avatar'
  | 'id_document'
  | 'driver_license'
  | 'vehicle_image'
  | 'checklist_image';

export type UploadImageResponse = {
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

type UploadImageParams = {
  target: UploadTarget;
  fileUri: string;
  fileName: string;
  mimeType: string;
  ownerId?: string;
  webFile?: File;
  /** Progreso de subida 0..1 (si la plataforma lo reporta). */
  onProgress?: (fraction: number) => void;
};

export async function uploadImageToApi(params: UploadImageParams): Promise<UploadImageResponse> {
  const formData = new FormData();

  if (params.webFile) {
    formData.append('file', params.webFile);
  } else {
    formData.append('file', {
      uri: params.fileUri,
      name: params.fileName,
      type: params.mimeType
    } as unknown as Blob);
  }

  if (params.ownerId) {
    formData.append('ownerId', params.ownerId);
  }

  const response = await httpClient.post<UploadImageResponse>(
    `/uploads/images/${params.target}`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      // Las subidas de imagen pueden tardar más que el timeout general de la API.
      timeout: 60000,
      onUploadProgress: params.onProgress
        ? (event) => {
            if (event.total && event.total > 0) {
              params.onProgress?.(Math.min(1, event.loaded / event.total));
            }
          }
        : undefined
    }
  );

  return response.data;
}
