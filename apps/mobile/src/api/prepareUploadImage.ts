import { ImagePickerAsset } from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { UploadTarget } from './uploads';

type PreparedUploadImage = {
  fileUri: string;
  fileName: string;
  mimeType: string;
  webFile?: File;
};

type TargetCompressionConfig = {
  maxBytes: number;
  maxWidth: number;
};

function getCompressionConfig(target: UploadTarget): TargetCompressionConfig {
  if (target === 'avatar') {
    return { maxBytes: 500 * 1024, maxWidth: 1024 };
  }

  return { maxBytes: 2 * 1024 * 1024, maxWidth: 1920 };
}

async function getFileSizeBytes(uri: string): Promise<number | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    return blob.size;
  } catch {
    return null;
  }
}

function buildJpgFileName(originalFileName: string | undefined, target: UploadTarget): string {
  const baseName = originalFileName?.replace(/\.[^/.]+$/, '') || `${target}-${Date.now()}`;

  return `${baseName}.jpg`;
}

async function buildWebFileIfNeeded(fileUri: string, fileName: string, mimeType: string): Promise<File | undefined> {
  if (Platform.OS !== 'web') {
    return undefined;
  }

  const response = await fetch(fileUri);
  const blob = await response.blob();

  return new File([blob], fileName, { type: mimeType });
}

export async function prepareUploadImage(
  asset: ImagePickerAsset,
  target: UploadTarget
): Promise<PreparedUploadImage> {
  const config = getCompressionConfig(target);
  const sourceWidth = asset.width ?? config.maxWidth;
  const sourceHeight = asset.height ?? config.maxWidth;
  const ratio = sourceWidth > 0 && sourceHeight > 0 ? sourceHeight / sourceWidth : 1;
  const effectiveBaseWidth = Math.min(sourceWidth, config.maxWidth);
  const qualitySteps = [0.78, 0.68, 0.58, 0.48, 0.4, 0.32];
  const scaleSteps = [1, 0.85, 0.7, 0.55, 0.45];

  let bestUri = asset.uri;
  let bestSize = await getFileSizeBytes(asset.uri);

  for (const scale of scaleSteps) {
    const nextWidth = Math.max(320, Math.floor(effectiveBaseWidth * scale));
    const nextHeight = Math.max(320, Math.floor(nextWidth * ratio));

    for (const quality of qualitySteps) {
      const manipulated = await manipulateAsync(
        asset.uri,
        [{ resize: { width: nextWidth, height: nextHeight } }],
        { compress: quality, format: SaveFormat.JPEG }
      );

      const sizeBytes = await getFileSizeBytes(manipulated.uri);
      bestUri = manipulated.uri;

      if (sizeBytes !== null) {
        bestSize = sizeBytes;
      }

      if (sizeBytes !== null && sizeBytes <= config.maxBytes) {
        const fileName = buildJpgFileName(asset.fileName ?? undefined, target);
        const mimeType = 'image/jpeg';

        return {
          fileUri: manipulated.uri,
          fileName,
          mimeType,
          webFile: await buildWebFileIfNeeded(manipulated.uri, fileName, mimeType)
        };
      }
    }
  }

  const fallbackFileName = buildJpgFileName(asset.fileName ?? undefined, target);
  const fallbackMimeType = 'image/jpeg';

  if (bestSize !== null && bestSize > config.maxBytes) {
    throw new Error('No se pudo comprimir la imagen por debajo del limite permitido');
  }

  return {
    fileUri: bestUri,
    fileName: fallbackFileName,
    mimeType: fallbackMimeType,
    webFile: await buildWebFileIfNeeded(bestUri, fallbackFileName, fallbackMimeType)
  };
}
