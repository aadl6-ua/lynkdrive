import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colorTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  variant?: 'elevated' | 'outlined' | 'muted';
  padding?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function Card({
  children,
  onPress,
  variant = 'elevated',
  padding = spacingTokens.lg,
  style,
  accessibilityLabel,
  accessibilityHint
}: CardProps) {
  const variantStyle =
    variant === 'muted' ? styles.muted : variant === 'outlined' ? styles.outlined : styles.elevated;

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [
          styles.base,
          variantStyle,
          { padding },
          pressed ? styles.pressed : null,
          style
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.base, variantStyle, { padding }, style]}>{children}</View>;
}

type CardHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  right?: ReactNode;
};

export function CardHeader({ title, subtitle, icon, right }: CardHeaderProps) {
  return (
    <View style={styles.header}>
      {icon ? (
        <View style={styles.headerIcon}>
          <Ionicons name={icon} size={18} color={colorTokens.primary} />
        </View>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? null}
    </View>
  );
}

type KeyValueRowProps = {
  label: string;
  value: string;
  emphasis?: boolean;
  last?: boolean;
};

export function KeyValueRow({ label, value, emphasis = false, last = false }: KeyValueRowProps) {
  return (
    <View style={[styles.kvRow, last ? null : styles.kvDivider]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, emphasis ? styles.kvValueEmphasis : null]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radiusTokens.card,
    gap: spacingTokens.md
  },
  elevated: {
    backgroundColor: colorTokens.white,
    borderWidth: 1,
    borderColor: colorTokens.border,
    ...shadowTokens.card
  },
  outlined: {
    backgroundColor: colorTokens.white,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  muted: {
    backgroundColor: colorTokens.surfaceMuted,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }]
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colorTokens.infoSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerText: {
    flex: 1,
    gap: 2
  },
  headerTitle: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  headerSubtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacingTokens.md,
    paddingVertical: spacingTokens.sm
  },
  kvDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colorTokens.border
  },
  kvLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.body,
    flexShrink: 0
  },
  kvValue: {
    flex: 1,
    textAlign: 'right',
    color: colorTokens.textMain,
    ...typographyTokens.bodyStrong
  },
  kvValueEmphasis: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel,
    fontSize: 16
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colorTokens.border
  }
});
