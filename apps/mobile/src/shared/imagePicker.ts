import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type ImageSource = 'library' | 'camera';

export class ImagePermissionError extends Error {}

type PickOptions = {
  multiple?: boolean;
  selectionLimit?: number;
};

/**
 * Abre galería o cámara con gestión de permisos. Devuelve [] si el usuario
 * cancela y lanza ImagePermissionError con un mensaje claro si deniega permiso.
 */
export async function pickImages(source: ImageSource, options: PickOptions = {}): Promise<ImagePicker.ImagePickerAsset[]> {
  if (source === 'camera') {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        throw new ImagePermissionError('Necesitamos acceso a la cámara. Actívalo en los ajustes del dispositivo.');
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false
    });

    return result.canceled ? [] : result.assets;
  }

  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      throw new ImagePermissionError('Necesitamos acceso a tus fotos. Actívalo en los ajustes del dispositivo.');
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: false,
    allowsMultipleSelection: options.multiple ?? false,
    selectionLimit: options.multiple ? options.selectionLimit ?? 0 : 1,
    orderedSelection: true
  });

  return result.canceled ? [] : result.assets;
}

export function canUseCamera(): boolean {
  // En web expo-image-picker abre el selector de ficheros con captura; lo
  // ofrecemos solo en nativo para no duplicar la opción de galería.
  return Platform.OS !== 'web';
}
