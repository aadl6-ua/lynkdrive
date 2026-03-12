import { Pressable, Text, View } from 'react-native';
import { styles } from '../styles';
import { APP_TABS, AppTabKey } from '../types';

const TAB_ICONS: Record<AppTabKey, string> = {
  explore: 'Explorar',
  trips: 'Viajes',
  myVehicles: 'Vehiculos',
  profile: 'Perfil'
};

type TabBarProps = {
  activeTab: AppTabKey;
  onChangeTab: (tab: AppTabKey) => void;
  bottom?: boolean;
};

export function TabBar({ activeTab, onChangeTab, bottom = false }: TabBarProps) {
  return (
    <View style={bottom ? styles.bottomNav : styles.topNav}>
      {APP_TABS.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChangeTab(tab.key)}
          style={[styles.navButton, activeTab === tab.key ? styles.navButtonActive : undefined]}
        >
          <Text style={activeTab === tab.key ? styles.navLabelActive : styles.navLabel}>
            {TAB_ICONS[tab.key]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
