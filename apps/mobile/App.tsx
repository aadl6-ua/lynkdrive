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
  const exploreTopPadding = isDesktopLike ? 104 : Platform.OS === 'android' ? 52 : 0;
  const exploreBottomPadding = !isDesktopLike ? 96 : 0;

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
      return <ExploreScreen topPadding={exploreTopPadding} bottomPadding={exploreBottomPadding} />;
    }

    if (activeTab === 'trips') {
      return <TripsScreen />;
    }

    if (activeTab === 'myVehicles') {
      return <MyVehiclesScreen topPadding={exploreTopPadding} bottomPadding={exploreBottomPadding} />;
    }

    return <ProfileScreen onNavigateToTab={setActiveTab} />;
  };

  const baseContentStyle = [
    styles.content,
    isDesktopLike ? { paddingTop: 104 } : undefined,
    !isDesktopLike && Platform.OS === 'android' ? { paddingTop: 52 } : undefined,
    !isDesktopLike ? styles.contentWithBottomBar : undefined
  ];

  return (
    <SafeAreaView style={styles.container}>
      {isDesktopLike ? <TabBar activeTab={activeTab} onChangeTab={setActiveTab} /> : null}

      {activeTab === 'explore' || activeTab === 'myVehicles' ? (
        renderActiveScreen()
      ) : (
        <ScrollView
          contentContainerStyle={baseContentStyle}
        >
          {renderActiveScreen()}
        </ScrollView>
      )}

      {!isDesktopLike ? <TabBar activeTab={activeTab} onChangeTab={setActiveTab} bottom /> : null}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
