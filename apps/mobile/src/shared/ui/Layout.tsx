import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions
} from 'react-native';
import { colorTokens, layoutTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';

type ScreenProps = {
  children: ReactNode;
  topPadding?: number;
  bottomPadding?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  maxWidth?: number;
  stickyHeaderIndices?: number[];
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  contentStyle?: StyleProp<ViewStyle>;
  /** Contenido fijo superpuesto (FAB, barras de acción). */
  overlay?: ReactNode;
};

/**
 * Contenedor estándar de pantalla: scroll con pull-to-refresh, teclado que no
 * tapa los campos, padding según barras de navegación y ancho máximo en web.
 */
export const Screen = forwardRef<ScrollView, ScreenProps>(function Screen(
  {
    children,
    topPadding = 0,
    bottomPadding = 0,
    refreshing = false,
    onRefresh,
    maxWidth = layoutTokens.contentMaxWidth,
    stickyHeaderIndices,
    onScroll,
    contentStyle,
    overlay
  },
  ref
) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={ref}
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPadding + spacingTokens.sm, paddingBottom: bottomPadding + spacingTokens.xl }
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        stickyHeaderIndices={stickyHeaderIndices}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colorTokens.primary}
              colors={[colorTokens.accent2]}
              progressViewOffset={topPadding}
            />
          ) : undefined
        }
      >
        <View style={[styles.inner, { maxWidth }, contentStyle]}>{children}</View>
      </ScrollView>
      {overlay ?? null}
    </KeyboardAvoidingView>
  );
});

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  eyebrow?: string;
};

/** Cabecera de pantalla con botón volver opcional, título H1 y acciones. */
export function ScreenHeader({ title, subtitle, onBack, backLabel = 'Volver', right, eyebrow }: ScreenHeaderProps) {
  const { width } = useWindowDimensions();
  const compactTitle = width < 380;

  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed ? styles.backPressed : null]}
        >
          <Ionicons name="chevron-back" size={20} color={colorTokens.primary} />
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
      ) : null}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
          <Text style={[styles.title, compactTitle ? styles.titleCompact : null]} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

type SectionTitleProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  count?: number;
};

export function SectionTitle({ title, actionLabel, onAction, count }: SectionTitleProps) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
        {typeof count === 'number' ? <Text style={styles.sectionCount}>  {count}</Text> : null}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  badge?: number;
};

type SegmentedControlProps<T extends string> = {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function SegmentedControl<T extends string>({ options, value, onChange, style, compact = false }: SegmentedControlProps<T>) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            style={[styles.segment, compact ? styles.segmentCompact : null, active ? styles.segmentActive : null]}
          >
            {option.icon ? (
              <Ionicons name={option.icon} size={16} color={active ? colorTokens.white : colorTokens.secondary} />
            ) : null}
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]} numberOfLines={1}>
              {option.label}
            </Text>
            {option.badge ? (
              <View style={[styles.segmentBadge, active ? styles.segmentBadgeActive : null]}>
                <Text style={[styles.segmentBadgeText, active ? styles.segmentBadgeTextActive : null]}>{option.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  content: {
    paddingHorizontal: spacingTokens.lg,
    flexGrow: 1
  },
  inner: {
    width: '100%',
    alignSelf: 'center',
    gap: spacingTokens.lg
  },
  header: {
    gap: spacingTokens.sm,
    paddingTop: spacingTokens.xs
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    minHeight: 36,
    paddingRight: spacingTokens.md,
    paddingLeft: 2,
    borderRadius: radiusTokens.pill
  },
  backPressed: {
    opacity: 0.6
  },
  backLabel: {
    color: colorTokens.primary,
    ...typographyTokens.captionStrong,
    fontSize: 14
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacingTokens.md
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  eyebrow: {
    color: colorTokens.accent2,
    ...typographyTokens.overline
  },
  title: {
    color: colorTokens.primary,
    ...typographyTokens.title
  },
  titleCompact: {
    fontSize: 26,
    lineHeight: 32
  },
  subtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.subtitle
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingTokens.sm
  },
  sectionTitle: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  sectionCount: {
    color: colorTokens.textSubtle,
    ...typographyTokens.bodyStrong
  },
  sectionAction: {
    minHeight: 32,
    justifyContent: 'center'
  },
  sectionActionText: {
    color: colorTokens.accent2,
    ...typographyTokens.captionStrong,
    fontSize: 14
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radiusTokens.pill,
    backgroundColor: colorTokens.white,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacingTokens.md,
    borderRadius: radiusTokens.pill
  },
  segmentCompact: {
    minHeight: 36,
    flex: 0
  },
  segmentActive: {
    backgroundColor: colorTokens.primary
  },
  segmentText: {
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong
  },
  segmentTextActive: {
    color: colorTokens.white
  },
  segmentBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colorTokens.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  segmentBadgeActive: {
    backgroundColor: colorTokens.accent2
  },
  segmentBadgeText: {
    color: colorTokens.secondary,
    ...typographyTokens.overline,
    letterSpacing: 0
  },
  segmentBadgeTextActive: {
    color: colorTokens.white
  }
});
