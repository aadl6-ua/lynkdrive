import { useEffect, useRef } from 'react';
import { Animated, DimensionValue, Easing, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colorTokens, radiusTokens, spacingTokens } from '../../app/theme/tokens';

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Bloque con pulso suave para estados de carga (sustituye spinners sueltos). */
export function Skeleton({ width = '100%', height = 14, radius = radiusTokens.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web'
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web'
        })
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius: radius, opacity }, style]}
    />
  );
}

/** Placeholder de tarjeta de vehículo (foto + título + chips). */
export function VehicleCardSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]} accessibilityLabel="Cargando" accessible>
      <Skeleton height={180} radius={radiusTokens.input} />
      <View style={styles.rowBetween}>
        <Skeleton width="55%" height={18} />
        <Skeleton width={64} height={18} />
      </View>
      <Skeleton width="75%" height={12} />
      <View style={styles.row}>
        <Skeleton width={64} height={22} radius={radiusTokens.pill} />
        <Skeleton width={80} height={22} radius={radiusTokens.pill} />
        <Skeleton width={70} height={22} radius={radiusTokens.pill} />
      </View>
    </View>
  );
}

/** Placeholder de fila/tarjeta de lista (reservas, reseñas...). */
export function ListItemSkeleton({ lines = 3, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]} accessibilityLabel="Cargando" accessible>
      <View style={styles.rowBetween}>
        <Skeleton width="50%" height={16} />
        <Skeleton width={84} height={22} radius={radiusTokens.pill} />
      </View>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '45%' : '85%'} height={12} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#E7EAEF'
  },
  card: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    padding: spacingTokens.lg,
    gap: spacingTokens.md,
    backgroundColor: colorTokens.white
  },
  row: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.sm
  }
});
