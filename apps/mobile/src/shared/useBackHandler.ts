import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/**
 * Botón "atrás" de Android: si `enabled`, ejecuta `onBack` (volver a la
 * pantalla anterior dentro de la pestaña) en lugar de cerrar la app.
 */
export function useBackHandler(enabled: boolean, onBack: () => void) {
  const handlerRef = useRef(onBack);
  handlerRef.current = onBack;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handlerRef.current();
      return true;
    });

    return () => subscription.remove();
  }, [enabled]);
}
