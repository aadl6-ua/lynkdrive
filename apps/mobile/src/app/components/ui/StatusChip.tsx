import { Text, View } from 'react-native';
import { styles } from '../../styles';
import { colorTokens, spacingTokens, typographyTokens } from '../../theme/tokens';

export type StatusChipTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger';

type StatusChipProps = {
  label: string;
  tone?: StatusChipTone;
  compact?: boolean;
};

const CHIP_TONE_STYLES: Record<
  StatusChipTone,
  { backgroundColor: string; borderColor: string; textColor: string }
> = {
  neutral: {
    backgroundColor: colorTokens.bgLight,
    borderColor: colorTokens.border,
    textColor: colorTokens.secondary
  },
  success: {
    backgroundColor: colorTokens.bgLight,
    borderColor: colorTokens.success,
    textColor: colorTokens.success
  },
  warning: {
    backgroundColor: colorTokens.bgLight,
    borderColor: colorTokens.accent1,
    textColor: colorTokens.secondary
  },
  info: {
    backgroundColor: colorTokens.bgLight,
    borderColor: colorTokens.secondary,
    textColor: colorTokens.secondary
  },
  danger: {
    backgroundColor: colorTokens.bgLight,
    borderColor: colorTokens.alert,
    textColor: colorTokens.alert
  }
};

export function StatusChip({ label, tone = 'neutral', compact = false }: StatusChipProps) {
  const toneStyle = CHIP_TONE_STYLES[tone];

  return (
    <View
      style={[
        styles.chipBase,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
          paddingHorizontal: compact ? spacingTokens.sm : spacingTokens.md,
          paddingVertical: compact ? spacingTokens.xs : spacingTokens.xs
        }
      ]}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: toneStyle.textColor,
            ...(compact ? typographyTokens.caption : null)
          }
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
