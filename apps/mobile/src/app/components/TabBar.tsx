import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_TABS, AppTabKey } from '../types';

const ACTIVE_ACCENT_COLOR = '#E36414';

type TabBarProps = {
  activeTab: AppTabKey;
  onChangeTab: (tab: AppTabKey) => void;
  bottom?: boolean;
};

export function TabBar({ activeTab, onChangeTab, bottom = false }: TabBarProps) {
  const isMobileBottomNav = bottom;

  if (isMobileBottomNav) {
    return (
      <View style={localStyles.mobileBottomNavShell}>
        <View style={localStyles.mobileBottomNavContainer}>
          {APP_TABS.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Pressable
                key={tab.key}
                onPress={() => onChangeTab(tab.key)}
                style={[localStyles.mobileIconButton, isActive ? localStyles.mobileIconButtonActive : undefined]}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
              >
                <Ionicons
                  name={getMobileIconName(tab.key, isActive)}
                  size={isActive ? 22 : 21}
                  color={isActive ? ACTIVE_ACCENT_COLOR : '#1B263B'}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={localStyles.desktopTopNavShell}>
      <View style={localStyles.desktopTopNavContainer}>
        {APP_TABS.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <Pressable
              key={tab.key}
              onPress={() => onChangeTab(tab.key)}
              style={[localStyles.desktopTabButton, isActive ? localStyles.desktopTabButtonActive : undefined]}
            >
              <Ionicons
                name={getTabIconName(tab.key, isActive)}
                size={isActive ? 18 : 17}
                color={isActive ? ACTIVE_ACCENT_COLOR : '#1B263B'}
              />
              <Text style={isActive ? localStyles.desktopTabLabelActive : localStyles.desktopTabLabel}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function getMobileIconName(tab: AppTabKey, isActive: boolean): keyof typeof Ionicons.glyphMap {
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

function getTabIconName(tab: AppTabKey, isActive: boolean): keyof typeof Ionicons.glyphMap {
  return getMobileIconName(tab, isActive);
}

const localStyles = StyleSheet.create({
  desktopTopNavShell: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: Platform.OS === 'web' ? 14 : 10,
    zIndex: 30,
    alignItems: 'center'
  },
  desktopTopNavContainer: {
    width: '100%',
    maxWidth: 1060,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#D5DBE4',
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#0B0F14',
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 4
  },
  desktopTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  desktopTabButtonActive: {
    backgroundColor: '#0D1B2A'
  },
  desktopTabLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#1B263B'
  },
  desktopTabLabelActive: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  mobileBottomNavShell: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 14 : 10
  },
  mobileBottomNavContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E4E8',
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: '#0B0F14',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5
    },
    elevation: 4
  },
  mobileIconButton: {
    width: 52,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileIconButtonActive: {
    backgroundColor: '#0D1B2A'
  }
});
