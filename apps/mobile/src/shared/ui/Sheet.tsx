import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colorTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { IconButton } from './Button';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Centrado (diálogo) en lugar de hoja inferior. */
  centered?: boolean;
};

/** Hoja modal inferior (móvil) / diálogo centrado (web ancho). */
export function Sheet({ visible, onClose, title, subtitle, children, centered = false }: SheetProps) {
  const insets = useSafeAreaInsets();
  const asDialog = centered || Platform.OS === 'web';

  return (
    <Modal visible={visible} transparent animationType={asDialog ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.backdrop, asDialog ? styles.backdropCentered : null]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            asDialog ? styles.dialog : { paddingBottom: Math.max(insets.bottom, spacingTokens.lg) }
          ]}
          accessibilityViewIsModal
        >
          {!asDialog ? <View style={styles.grabber} /> : null}
          {title ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title} accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <IconButton icon="close" onPress={onClose} accessibilityLabel="Cerrar" variant="ghost" size={36} />
            </View>
          ) : null}
          <ScrollView bounces={false} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export type SheetOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
};

type OptionListProps<T extends string> = {
  options: Array<SheetOption<T>>;
  selected?: T | null;
  onSelect: (value: T) => void;
};

export function OptionList<T extends string>({ options, selected, onSelect }: OptionListProps<T>) {
  return (
    <View style={styles.optionList}>
      {options.map((option, index) => {
        const isSelected = selected !== undefined && selected === option.value;
        const color = option.destructive ? colorTokens.alertText : colorTokens.primary;

        return (
          <Pressable
            key={option.value || `option-${index}`}
            onPress={() => onSelect(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => [
              styles.option,
              index === options.length - 1 ? styles.optionLast : null,
              isSelected ? styles.optionSelected : null,
              pressed ? styles.optionPressed : null
            ]}
          >
            {option.icon ? <Ionicons name={option.icon} size={20} color={color} /> : null}
            <View style={styles.optionText}>
              <Text style={[styles.optionLabel, { color }, isSelected ? styles.optionLabelSelected : null]}>
                {option.label}
              </Text>
              {option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}
            </View>
            {isSelected ? <Ionicons name="checkmark" size={20} color={colorTokens.accent2} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colorTokens.overlay,
    justifyContent: 'flex-end'
  },
  backdropCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacingTokens.lg
  },
  sheet: {
    backgroundColor: colorTokens.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacingTokens.sm,
    maxHeight: '88%',
    ...shadowTokens.raised
  },
  dialog: {
    width: '100%',
    maxWidth: 480,
    borderRadius: radiusTokens.lg,
    paddingBottom: spacingTokens.lg,
    paddingTop: spacingTokens.md
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colorTokens.borderStrong,
    marginBottom: spacingTokens.sm
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingTokens.lg,
    paddingBottom: spacingTokens.sm,
    gap: spacingTokens.sm
  },
  headerText: {
    flex: 1,
    gap: 2
  },
  title: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  subtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  body: {
    paddingHorizontal: spacingTokens.lg,
    paddingBottom: spacingTokens.sm,
    gap: spacingTokens.md
  },
  optionList: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    overflow: 'hidden'
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    minHeight: 52,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colorTokens.border,
    backgroundColor: colorTokens.white
  },
  optionLast: {
    borderBottomWidth: 0
  },
  optionSelected: {
    backgroundColor: colorTokens.bgLight
  },
  optionPressed: {
    backgroundColor: colorTokens.surfaceMuted
  },
  optionText: {
    flex: 1,
    gap: 2
  },
  optionLabel: {
    ...typographyTokens.body
  },
  optionLabelSelected: {
    ...typographyTokens.bodyStrong
  },
  optionDescription: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  }
});
