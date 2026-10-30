import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { OptionList, Sheet, SheetOption } from './Sheet';
import { FieldError } from './States';

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  options: Array<SheetOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Selector accesible que abre una hoja con opciones (igual en web y nativo). */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecciona una opción',
  required = false,
  error,
  containerStyle
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityHint="Abre la lista de opciones"
        style={({ pressed }) => [
          styles.trigger,
          { borderColor: error ? colorTokens.alert : colorTokens.border },
          pressed ? styles.triggerPressed : null
        ]}
      >
        <Text style={selected ? styles.value : styles.placeholder} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colorTokens.textMuted} />
      </Pressable>
      <FieldError message={error} />

      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <OptionList
          options={options}
          selected={value}
          onSelect={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6
  },
  label: {
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong
  },
  required: {
    color: colorTokens.accent2
  },
  trigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radiusTokens.input,
    paddingHorizontal: spacingTokens.md,
    backgroundColor: colorTokens.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingTokens.sm
  },
  triggerPressed: {
    backgroundColor: colorTokens.bgLight
  },
  value: {
    flex: 1,
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  placeholder: {
    flex: 1,
    color: colorTokens.textSubtle,
    ...typographyTokens.body
  }
});
