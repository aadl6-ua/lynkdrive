import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colorTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';

type StarRatingProps = {
  value: number;
  size?: number;
  /** Si se pasa, las estrellas son pulsables (entrada de valoración). */
  onChange?: (value: number) => void;
  showValue?: boolean;
};

const RATING_LABELS = ['', 'Muy mala', 'Mejorable', 'Correcta', 'Muy buena', 'Excelente'];

export function StarRating({ value, size = 16, onChange, showValue = false }: StarRatingProps) {
  const rounded = Math.round(value);

  if (onChange) {
    return (
      <View style={styles.inputWrap}>
        <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={`Valoración: ${rounded} de 5`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable
              key={star}
              onPress={() => onChange(star)}
              accessibilityRole="button"
              accessibilityLabel={`${star} ${star === 1 ? 'estrella' : 'estrellas'}`}
              accessibilityState={{ selected: star === rounded }}
              hitSlop={4}
              style={({ pressed }) => [styles.inputStar, pressed ? styles.pressed : null]}
            >
              <Ionicons
                name={star <= rounded ? 'star' : 'star-outline'}
                size={size}
                color={star <= rounded ? colorTokens.accent1 : colorTokens.borderStrong}
              />
            </Pressable>
          ))}
        </View>
        <Text style={styles.inputLabel}>{RATING_LABELS[rounded] ?? ''}</Text>
      </View>
    );
  }

  return (
    <View style={styles.row} accessible accessibilityLabel={`${value.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const name = value >= star ? 'star' : value >= star - 0.5 ? 'star-half' : 'star-outline';
        return (
          <Ionicons
            key={star}
            name={name}
            size={size}
            color={value >= star - 0.5 ? colorTokens.accent1 : colorTokens.borderStrong}
          />
        );
      })}
      {showValue ? <Text style={styles.value}>{value.toFixed(1)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  inputWrap: {
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  inputStar: {
    padding: spacingTokens.xs
  },
  pressed: {
    transform: [{ scale: 0.92 }]
  },
  inputLabel: {
    color: colorTokens.textMuted,
    minHeight: 22,
    ...typographyTokens.bodyStrong
  },
  value: {
    marginLeft: 4,
    color: colorTokens.textMain,
    ...typographyTokens.captionStrong
  }
});
