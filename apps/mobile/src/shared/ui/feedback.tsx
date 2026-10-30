import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colorTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { Button } from './Button';

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

export type ToastType = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
};

type ToastState = {
  current: ToastItem | null;
  show: (type: ToastType, message: string) => void;
  hide: () => void;
};

let toastSeq = 0;

const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (type, message) => {
    toastSeq += 1;
    set({ current: { id: toastSeq, type, message } });
  },
  hide: () => set({ current: null })
}));

/** API imperativa para feedback no bloqueante (éxitos, errores de acciones). */
export const toast = {
  success: (message: string) => useToastStore.getState().show('success', message),
  error: (message: string) => useToastStore.getState().show('error', message),
  info: (message: string) => useToastStore.getState().show('info', message)
};

const TOAST_ICONS: Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: 'checkmark-circle', color: colorTokens.success },
  error: { icon: 'alert-circle', color: '#FF8A7D' },
  info: { icon: 'information-circle', color: colorTokens.accent1 }
};

export function ToastHost({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const { current, hide } = useToastStore();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) {
      return;
    }

    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();

    const timeout = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start(() => hide());
    }, current.type === 'error' ? 4500 : 3000);

    return () => clearTimeout(timeout);
  }, [current, anim, hide]);

  if (!current) {
    return null;
  }

  const meta = TOAST_ICONS[current.type];

  return (
    <View pointerEvents="box-none" style={[styles.toastLayer, { bottom: bottomOffset + insets.bottom + spacingTokens.md }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }]
          }
        ]}
      >
        <Ionicons name={meta.icon} size={20} color={meta.color} />
        <Text style={styles.toastText}>{current.message}</Text>
        <Pressable onPress={hide} accessibilityRole="button" accessibilityLabel="Cerrar notificación" hitSlop={10}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmaciones (multiplataforma: Alert.alert no funciona en web)            */
/* -------------------------------------------------------------------------- */

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmState = {
  request: (ConfirmOptions & { resolve: (value: boolean) => void }) | null;
  open: (options: ConfirmOptions) => Promise<boolean>;
  close: (result: boolean) => void;
};

const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  open: (options) =>
    new Promise<boolean>((resolve) => {
      get().request?.resolve(false);
      set({ request: { ...options, resolve } });
    }),
  close: (result) => {
    const current = get().request;
    set({ request: null });
    current?.resolve(result);
  }
}));

/** Pide confirmación antes de acciones destructivas o sensibles. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open(options);
}

export function ConfirmHost() {
  const { request, close } = useConfirmStore();

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={styles.confirmBackdrop}>
        <View style={styles.confirmCard} accessibilityViewIsModal>
          {request?.destructive ? (
            <View style={styles.confirmIconDanger}>
              <Ionicons name="warning-outline" size={22} color={colorTokens.alertText} />
            </View>
          ) : null}
          <Text style={styles.confirmTitle} accessibilityRole="header">
            {request?.title}
          </Text>
          {request?.message ? <Text style={styles.confirmMessage}>{request.message}</Text> : null}
          <View style={styles.confirmActions}>
            <Button
              label={request?.cancelLabel ?? 'Cancelar'}
              variant="secondary"
              onPress={() => close(false)}
              style={styles.confirmButton}
            />
            <Button
              label={request?.confirmLabel ?? 'Confirmar'}
              variant={request?.destructive ? 'danger' : 'primary'}
              onPress={() => close(true)}
              style={styles.confirmButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toastLayer: {
    position: 'absolute',
    left: spacingTokens.lg,
    right: spacingTokens.lg,
    alignItems: 'center',
    zIndex: 100
  },
  toast: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    backgroundColor: colorTokens.primary,
    borderRadius: radiusTokens.card,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.md,
    ...shadowTokens.raised
  },
  toastText: {
    flex: 1,
    color: colorTokens.white,
    ...typographyTokens.caption,
    fontSize: 14,
    lineHeight: 20
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: colorTokens.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacingTokens.xl
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colorTokens.white,
    borderRadius: radiusTokens.lg,
    padding: spacingTokens.xl,
    gap: spacingTokens.sm,
    ...shadowTokens.raised
  },
  confirmIconDanger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colorTokens.alertSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacingTokens.xs
  },
  confirmTitle: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  confirmMessage: {
    color: colorTokens.textMuted,
    ...typographyTokens.body
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacingTokens.sm,
    marginTop: spacingTokens.md
  },
  confirmButton: {
    flex: 1
  }
});
