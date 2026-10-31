import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colorTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { TextField } from '../ui';
import { useGeocodingSuggestions } from '../useGeocodingSuggestions';

type AddressSearchProps = {
  value: string;
  required?: boolean;
  error?: string | null;
  selected: boolean;
  onChange: (value: string) => void;
  onSelect: (label: string, lat: number, lng: number) => void;
  onClear: () => void;
  placeholder?: string;
  label?: string;
};

/** Buscador de dirección con sugerencias del backend (Nominatim). */
export function AddressSearch({ value, selected, onChange, onSelect, onClear, placeholder, label, required, error: fieldError }: AddressSearchProps) {
  const { suggestions, loading, error, searched } = useGeocodingSuggestions(selected ? '' : value);

  return (
    <View style={styles.addressSearch}>
      <TextField
        label={label}
        required={required}
        error={fieldError}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? 'Busca una ciudad o dirección'}
        leftIcon="location-outline"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={label ?? 'Ubicación'}
        right={
          loading ? (
            <ActivityIndicator size="small" color={colorTokens.textMuted} />
          ) : value ? (
            <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Borrar ubicación" hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={colorTokens.textSubtle} />
            </Pressable>
          ) : null
        }
        hint={selected ? 'Ubicación seleccionada' : undefined}
      />
      {error ? <Text style={styles.addressError}>{error}</Text> : null}
      {!selected && !loading && !error && searched && suggestions.length === 0 ? (
        <Text style={styles.addressEmpty}>Sin resultados. Prueba con otra dirección o una ciudad.</Text>
      ) : null}
      {!selected && suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.id}
              onPress={() => onSelect(suggestion.label, suggestion.lat, suggestion.lng)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.suggestion,
                index === suggestions.length - 1 ? styles.suggestionLast : null,
                pressed ? styles.suggestionPressed : null
              ]}
            >
              <Ionicons name="navigate-outline" size={16} color={colorTokens.textMuted} />
              <Text style={styles.suggestionText} numberOfLines={2}>
                {suggestion.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  addressSearch: {
    gap: spacingTokens.xs
  },
  addressError: {
    color: colorTokens.alertText,
    ...typographyTokens.caption
  },
  addressEmpty: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  suggestions: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.white,
    overflow: 'hidden',
    ...shadowTokens.card
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    minHeight: 48,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colorTokens.border
  },
  suggestionLast: {
    borderBottomWidth: 0
  },
  suggestionPressed: {
    backgroundColor: colorTokens.bgLight
  },
  suggestionText: {
    flex: 1,
    color: colorTokens.textMain,
    ...typographyTokens.body
  }
});
