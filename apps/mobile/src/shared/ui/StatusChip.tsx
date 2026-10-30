import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';

export type StatusChipTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger' | 'accent';

type StatusChipProps = {
  label: string;
  tone?: StatusChipTone;
  compact?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  dot?: boolean;
};

export const CHIP_TONES: Record<StatusChipTone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: colorTokens.surfaceMuted, fg: colorTokens.secondary, dot: colorTokens.textSubtle },
  success: { bg: colorTokens.successSoft, fg: colorTokens.successText, dot: colorTokens.success },
  warning: { bg: colorTokens.warningSoft, fg: colorTokens.warningText, dot: colorTokens.accent1 },
  info: { bg: colorTokens.infoSoft, fg: colorTokens.primary, dot: colorTokens.secondary },
  danger: { bg: colorTokens.alertSoft, fg: colorTokens.alertText, dot: colorTokens.alert },
  accent: { bg: colorTokens.accentSoft, fg: colorTokens.accent2Pressed, dot: colorTokens.accent2 }
};

export function StatusChip({ label, tone = 'neutral', compact = false, icon, dot = false }: StatusChipProps) {
  const palette = CHIP_TONES[tone];

  return (
    <View
      style={[styles.chip, compact ? styles.compact : null, { backgroundColor: palette.bg }]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: palette.dot }]} /> : null}
      {icon ? <Ionicons name={icon} size={compact ? 12 : 14} color={palette.fg} /> : null}
      <Text style={[styles.text, compact ? styles.textCompact : null, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radiusTokens.pill,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: 5
  },
  compact: {
    paddingHorizontal: 10,
    paddingVertical: 3
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  text: {
    ...typographyTokens.captionStrong
  },
  textCompact: {
    fontSize: 12,
    lineHeight: 16
  }
});
