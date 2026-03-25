import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, SafeAreaView, ScrollView, useWindowDimensions } from 'react-native';
import { TabBar } from './src/app/components/TabBar';
import { styles } from './src/app/styles';
import { AppTabKey } from './src/app/types';
import { ExploreScreen } from './src/features/explore/ExploreScreen';
import { ProfileScreen } from './src/features/profile/ProfileScreen';
import { TripsScreen } from './src/features/trips/TripsScreen';
import { MyVehiclesScreen } from './src/features/vehicles/MyVehiclesScreen';
import { useAuthStore } from './src/store/useAuthStore';
import { useUserProfileStore } from './src/store/useUserProfileStore';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTabKey>('explore');
  const { width } = useWindowDimensions();
  const isDesktopLike = Platform.OS === 'web' || width >= 768;

  const { fetchMyProfile } = useUserProfileStore();
  const { userId: authUserId, hydrateSession } = useAuthStore();

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    if (!authUserId) {
      return;
    }

    void fetchMyProfile();
  }, [authUserId, fetchMyProfile]);

  const renderActiveScreen = () => {
    if (activeTab === 'explore') {
      return <ExploreScreen />;
    }

    if (activeTab === 'trips') {
      return <TripsScreen />;
    }

    if (activeTab === 'myVehicles') {
      return <MyVehiclesScreen />;
    }

    return <ProfileScreen />;
  };

  return (
    <SafeAreaView style={styles.container}>
      {isDesktopLike ? <TabBar activeTab={activeTab} onChangeTab={setActiveTab} /> : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isDesktopLike ? { paddingTop: 104 } : undefined,
          !isDesktopLike ? styles.contentWithBottomBar : undefined
        ]}
      >
        {renderActiveScreen()}
      </ScrollView>

      {!isDesktopLike ? <TabBar activeTab={activeTab} onChangeTab={setActiveTab} bottom /> : null}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
