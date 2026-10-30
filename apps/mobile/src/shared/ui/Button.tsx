import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colorTokens, HIT_SIZE, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'dangerGhost' | 'ghost';
export type ButtonSize = 'md' | 'sm';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

const VARIANTS: Record<
  ButtonVariant,
  { bg: string; bgPressed: string; border: string; text: string }
> = {
  primary: {
    bg: colorTokens.primary,
    bgPressed: colorTokens.primaryPressed,
    border: colorTokens.primary,
    text: colorTokens.white
  },
  secondary: {
    bg: colorTokens.white,
    bgPressed: colorTokens.surfaceMuted,
    border: colorTokens.border,
    text: colorTokens.secondary
  },
  accent: {
    bg: colorTokens.accent2,
    bgPressed: colorTokens.accent2Pressed,
    border: colorTokens.accent2,
    text: colorTokens.white
  },
  danger: {
    bg: colorTokens.alert,
    bgPressed: colorTokens.alertText,
    border: colorTokens.alert,
    text: colorTokens.white
  },
  dangerGhost: {
    bg: colorTokens.white,
    bgPressed: colorTokens.alertSoft,
    border: '#F5C2BC',
    text: colorTokens.alertText
  },
  ghost: {
    bg: 'transparent',
    bgPressed: colorTokens.surfaceMuted,
    border: 'transparent',
    text: colorTokens.secondary
  }
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID
}: ButtonProps) {
  const palette = VARIANTS[variant];
  const isDisabled = disabled || loading;
  const iconSize = size === 'sm' ? 16 : 18;

  const iconNode = icon ? <Ionicons name={icon} size={iconSize} color={palette.text} /> : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={size === 'sm' ? 6 : 0}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        {
          backgroundColor: pressed && !isDisabled ? palette.bgPressed : palette.bg,
          borderColor: palette.border
        },
        fullWidth ? styles.fullWidth : null,
        isDisabled ? styles.disabled : null,
        style
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : iconPosition === 'left' ? (
          iconNode
        ) : null}
        <Text
          numberOfLines={1}
          style={[size === 'sm' ? styles.labelSm : styles.label, { color: palette.text }]}
        >
          {label}
        </Text>
        {!loading && iconPosition === 'right' ? iconNode : null}
      </View>
    </Pressable>
  );
}

type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'secondary' | 'ghost' | 'overlay' | 'primary';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
};

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'secondary',
  size = HIT_SIZE,
  disabled = false,
  style,
  color
}: IconButtonProps) {
  const bg =
    variant === 'primary'
      ? colorTokens.primary
      : variant === 'overlay'
        ? 'rgba(255,255,255,0.94)'
        : variant === 'ghost'
          ? 'transparent'
          : colorTokens.white;
  const fg = color ?? (variant === 'primary' ? colorTokens.white : colorTokens.secondary);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={Math.max(0, (HIT_SIZE - size) / 2)}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderColor: variant === 'secondary' ? colorTokens.border : 'transparent',
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1
        },
        style
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radiusTokens.input,
    alignItems: 'center',
    justifyContent: 'center'
  },
  md: {
    minHeight: 48,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.sm
  },
  sm: {
    minHeight: 36,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs
  },
  fullWidth: {
    alignSelf: 'stretch'
  },
  disabled: {
    opacity: 0.45
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingTokens.sm
  },
  label: {
    ...typographyTokens.captionStrong,
    fontSize: 15,
    lineHeight: 20
  },
  labelSm: {
    ...typographyTokens.captionStrong
  },
  iconButton: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
