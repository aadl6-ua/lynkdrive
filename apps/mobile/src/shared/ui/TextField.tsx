import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, ReactNode, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle
} from 'react-native';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { FieldError } from './States';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  right?: ReactNode;
  /** Muestra conmutador de visibilidad para contraseñas. */
  passwordToggle?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  readOnlyValue?: boolean;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    required = false,
    hint,
    error,
    leftIcon,
    right,
    passwordToggle = false,
    containerStyle,
    multiline,
    secureTextEntry,
    readOnlyValue = false,
    onFocus,
    onBlur,
    editable = true,
    ...inputProps
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isEditable = editable && !readOnlyValue;

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  const borderColor = error ? colorTokens.alert : focused ? colorTokens.primary : colorTokens.border;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          multiline ? styles.fieldMultiline : null,
          { borderColor },
          focused ? styles.fieldFocused : null,
          !isEditable ? styles.fieldReadOnly : null
        ]}
      >
        {leftIcon ? <Ionicons name={leftIcon} size={18} color={colorTokens.textMuted} /> : null}
        <TextInput
          ref={ref}
          {...inputProps}
          editable={isEditable}
          multiline={multiline}
          secureTextEntry={passwordToggle ? !revealed : secureTextEntry}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={colorTokens.textSubtle}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          accessibilityHint={error ?? hint}
          style={[
            styles.input,
            multiline ? styles.inputMultiline : null,
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null
          ]}
        />
        {passwordToggle ? (
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            hitSlop={12}
          >
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={colorTokens.textMuted} />
          </Pressable>
        ) : null}
        {right ?? null}
      </View>
      {error ? <FieldError message={error} /> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radiusTokens.input,
    paddingHorizontal: spacingTokens.md,
    backgroundColor: colorTokens.white
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    paddingVertical: spacingTokens.sm
  },
  fieldFocused: {
    borderWidth: 1.5
  },
  fieldReadOnly: {
    backgroundColor: colorTokens.surfaceMuted
  },
  input: {
    flex: 1,
    minHeight: 46,
    paddingVertical: Platform.OS === 'ios' ? spacingTokens.sm : 0,
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  inputMultiline: {
    minHeight: 104,
    textAlignVertical: 'top',
    paddingVertical: spacingTokens.xs
  },
  hint: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  }
});
