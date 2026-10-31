import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode, useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { Button } from './Button';

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  style
}: EmptyStateProps) {
  return (
    <View style={[styles.empty, compact ? styles.emptyCompact : null, style]}>
      <View style={[styles.emptyIcon, compact ? styles.emptyIconCompact : null]}>
        <Ionicons name={icon} size={compact ? 22 : 28} color={colorTokens.secondary} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.emptyActions}>
          <Button label={actionLabel} onPress={onAction} />
          {secondaryActionLabel && onSecondaryAction ? (
            <Button label={secondaryActionLabel} onPress={onSecondaryAction} variant="secondary" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ErrorState({ title = 'Algo no ha ido bien', message, onRetry, retrying = false, style }: ErrorStateProps) {
  return (
    <View style={[styles.empty, style]}>
      <View style={[styles.emptyIcon, { backgroundColor: colorTokens.alertSoft }]}>
        <Ionicons name="cloud-offline-outline" size={28} color={colorTokens.alertText} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.emptyDescription}>{message}</Text>
      {onRetry ? (
        <View style={styles.emptyActions}>
          <Button label="Reintentar" icon="refresh" onPress={onRetry} loading={retrying} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

export type InlineMessageTone = 'info' | 'success' | 'warning' | 'error';

type InlineMessageProps = {
  tone?: InlineMessageTone;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

const INLINE_TONES: Record<InlineMessageTone, { bg: string; fg: string; border: string; icon: keyof typeof Ionicons.glyphMap }> = {
  info: { bg: colorTokens.infoSoft, fg: colorTokens.primary, border: '#D3DCEA', icon: 'information-circle' },
  success: { bg: colorTokens.successSoft, fg: colorTokens.successText, border: '#BFE9D0', icon: 'checkmark-circle' },
  warning: { bg: colorTokens.warningSoft, fg: colorTokens.warningText, border: '#F3E3A6', icon: 'alert-circle' },
  error: { bg: colorTokens.alertSoft, fg: colorTokens.alertText, border: '#F5C2BC', icon: 'close-circle' }
};

/** Banner inline para errores de formulario, avisos y bloqueos explicados. */
export function InlineMessage({
  tone = 'info',
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
  style,
  children
}: InlineMessageProps) {
  const palette = INLINE_TONES[tone];

  return (
    <View
      style={[styles.inline, { backgroundColor: palette.bg, borderColor: palette.border }, style]}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
    >
      <Ionicons name={palette.icon} size={18} color={palette.fg} style={styles.inlineIcon} />
      <View style={styles.inlineBody}>
        {title ? <Text style={[styles.inlineTitle, { color: palette.fg }]}>{title}</Text> : null}
        <Text style={[styles.inlineText, { color: palette.fg }]}>{message}</Text>
        {children}
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8} style={styles.inlineAction}>
            <Text style={[styles.inlineActionText, { color: palette.fg }]}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={14} color={palette.fg} />
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Cerrar aviso" hitSlop={10}>
          <Ionicons name="close" size={18} color={palette.fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Texto de error de campo, pequeño y bajo el input. */
export function FieldError({ message }: { message?: string | null }) {
  // iOS no anuncia los cambios de rol "alert": se lee el error al aparecer o cambiar.
  useEffect(() => {
    if (message && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);

  if (!message) {
    return null;
  }

  return (
    <View style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Ionicons name="alert-circle" size={14} color={colorTokens.alertText} />
      <Text style={styles.fieldErrorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingTokens.sm,
    paddingVertical: spacingTokens.xxl,
    paddingHorizontal: spacingTokens.xl,
    borderRadius: radiusTokens.card,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderStyle: 'dashed',
    backgroundColor: colorTokens.white
  },
  emptyCompact: {
    paddingVertical: spacingTokens.xl
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colorTokens.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacingTokens.xs
  },
  emptyIconCompact: {
    width: 44,
    height: 44,
    borderRadius: 22
  },
  emptyTitle: {
    color: colorTokens.primary,
    textAlign: 'center',
    ...typographyTokens.h3
  },
  emptyDescription: {
    color: colorTokens.textMuted,
    textAlign: 'center',
    maxWidth: 420,
    ...typographyTokens.body
  },
  emptyActions: {
    marginTop: spacingTokens.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacingTokens.sm
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacingTokens.sm,
    borderWidth: 1,
    borderRadius: radiusTokens.input,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md
  },
  inlineIcon: {
    marginTop: 2
  },
  inlineBody: {
    flex: 1,
    gap: 4
  },
  inlineTitle: {
    ...typographyTokens.captionStrong,
    fontSize: 14
  },
  inlineText: {
    ...typographyTokens.caption
  },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
    minHeight: 28
  },
  inlineActionText: {
    ...typographyTokens.captionStrong,
    textDecorationLine: 'underline'
  },
  fieldError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  fieldErrorText: {
    color: colorTokens.alertText,
    ...typographyTokens.caption,
    flex: 1
  }
});
