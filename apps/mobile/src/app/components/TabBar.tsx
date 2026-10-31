import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colorTokens, motionTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from '../theme/tokens';
import { EASE_OUT, USE_NATIVE_DRIVER, useReducedMotion } from '../../shared/ui/Motion';
import { APP_TABS, AppTabKey } from '../types';

/** Fondo de la pestaña activa: aparece con fundido y un leve zoom en vez de saltar. */
function ActiveBackdrop({ active, radius }: { active: boolean; radius: number }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: reducedMotion ? 0 : motionTokens.durationShortMs,
      easing: EASE_OUT,
      useNativeDriver: USE_NATIVE_DRIVER
    });
    animation.start();
    return () => animation.stop();
  }, [active, progress, reducedMotion]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: radius, backgroundColor: colorTokens.primary, opacity: progress, transform: [{ scale }] }
      ]}
    />
  );
}

type TabBarProps = {
  activeTab: AppTabKey;
  onChangeTab: (tab: AppTabKey) => void;
  bottom?: boolean;
};

function getTabIconName(tab: AppTabKey, isActive: boolean): keyof typeof Ionicons.glyphMap {
  if (tab === 'explore') {
    return isActive ? 'compass' : 'compass-outline';
  }

  if (tab === 'trips') {
    return isActive ? 'map' : 'map-outline';
  }

  if (tab === 'myVehicles') {
    return isActive ? 'car-sport' : 'car-sport-outline';
  }

  return isActive ? 'person-circle' : 'person-circle-outline';
}

export function TabBar({ activeTab, onChangeTab, bottom = false }: TabBarProps) {
  const insets = useSafeAreaInsets();

  if (bottom) {
    return (
      <View style={[styles.mobileShell, { bottom: Math.max(insets.bottom, spacingTokens.sm) + 2 }]} accessibilityRole="tablist">
        <View style={styles.mobileContainer}>
          {APP_TABS.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Pressable
                key={tab.key}
                onPress={() => onChangeTab(tab.key)}
                android_ripple={{ color: 'rgba(13,27,42,0.08)', borderless: true, radius: 36 }}
                style={({ pressed }) => [styles.mobileTab, pressed && Platform.OS === 'ios' ? styles.mobileTabPressed : null]}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
              >
                <View style={styles.mobileIconPill}>
                  <ActiveBackdrop active={isActive} radius={15} />
                  <Ionicons
                    name={getTabIconName(tab.key, isActive)}
                    size={21}
                    color={isActive ? colorTokens.accent2 : colorTokens.secondary}
                  />
                </View>
                <Text style={[styles.mobileLabel, isActive ? styles.mobileLabelActive : null]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.desktopShell, { top: insets.top + 14 }]} accessibilityRole="tablist">
      <View style={styles.desktopContainer}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandLetter}>L</Text>
          </View>
          <Text style={styles.brandName}>LynkDrive</Text>
        </View>
        <View style={styles.desktopTabs}>
          {APP_TABS.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Pressable
                key={tab.key}
                onPress={() => onChangeTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.desktopTab,
                  pressed && !isActive ? styles.desktopTabPressed : null
                ]}
              >
                <ActiveBackdrop active={isActive} radius={18} />
                <Ionicons
                  name={getTabIconName(tab.key, isActive)}
                  size={18}
                  color={isActive ? colorTokens.accent2 : colorTokens.secondary}
                />
                <Text style={isActive ? styles.desktopLabelActive : styles.desktopLabel}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopShell: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    alignItems: 'center'
  },
  desktopContainer: {
    width: '100%',
    maxWidth: 1100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingTokens.md,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.97)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...shadowTokens.raised,
    shadowOpacity: 0.08
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    paddingHorizontal: spacingTokens.sm
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colorTokens.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandLetter: {
    color: colorTokens.accent1,
    ...typographyTokens.h3,
    lineHeight: undefined
  },
  brandName: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  desktopTabs: {
    flex: 1,
    maxWidth: 720,
    flexDirection: 'row',
    gap: 6
  },
  desktopTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 44
  },
  desktopTabPressed: {
    backgroundColor: colorTokens.surfaceMuted
  },
  desktopLabel: {
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong
  },
  desktopLabelActive: {
    color: colorTokens.white,
    ...typographyTokens.captionStrong
  },
  mobileShell: {
    position: 'absolute',
    left: 12,
    right: 12
  },
  mobileContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.lg + 8,
    backgroundColor: colorTokens.white,
    paddingHorizontal: 6,
    paddingVertical: 6,
    ...shadowTokens.raised
  },
  mobileTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 52
  },
  mobileTabPressed: {
    opacity: 0.6
  },
  mobileIconPill: {
    width: 48,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.overline,
    fontSize: 10,
    letterSpacing: 0.2
  },
  mobileLabelActive: {
    color: colorTokens.primary
  }
});
