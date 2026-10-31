// Importamos solo los pesos usados para no empaquetar todas las variantes.
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from './src/app/components/TabBar';
import { colorTokens, layoutTokens, spacingTokens, typographyTokens } from './src/app/theme/tokens';
import { APP_TABS, AppTabKey } from './src/app/types';
import { onAccountBlocked } from './src/api/http';
import { AccountBlockedScreen } from './src/features/auth/AccountBlockedScreen';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { getWebRecoveryTokens, PasswordResetScreen } from './src/features/auth/PasswordResetScreen';
import { ExploreScreen } from './src/features/explore/ExploreScreen';
import { getWebLegalDoc, LegalPage } from './src/features/legal/LegalPage';
import { usePushNotifications } from './src/features/notifications/usePushNotifications';
import { ProfileScreen } from './src/features/profile/ProfileScreen';
import { TripsScreen } from './src/features/trips/TripsScreen';
import { MyVehiclesScreen } from './src/features/vehicles/MyVehiclesScreen';
import { ConfirmHost, ScreenTransition, ToastHost } from './src/shared/ui';
import { useAuthStore } from './src/store/useAuthStore';
import { useUserProfileStore } from './src/store/useUserProfileStore';

// Mantenemos el splash nativo hasta tener fuentes cargadas (no aplica en web).
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Si las fuentes tardan (red lenta en web) no bloqueamos el arranque. */
const FONT_LOAD_TIMEOUT_MS = 2500;

// Se lee una vez al cargar: las páginas legales públicas no dependen de la sesión.
const webLegalDoc = getWebLegalDoc();
// Enlace del email de recuperación de contraseña (solo web).
const webRecoveryTokens = getWebRecoveryTokens();

function AppShell() {
  const [activeTab, setActiveTab] = useState<AppTabKey>('explore');
  // La pantalla nueva entra desde el lado de su pestaña respecto a la anterior.
  const [tabDirection, setTabDirection] = useState<1 | -1>(1);
  const activeTabRef = useRef(activeTab);
  const changeTab = useCallback((next: AppTabKey) => {
    const tabIndex = (key: AppTabKey) => APP_TABS.findIndex((tab) => tab.key === key);
    setTabDirection(tabIndex(next) >= tabIndex(activeTabRef.current) ? 1 : -1);
    activeTabRef.current = next;
    setActiveTab(next);
  }, []);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Navegación superior solo en pantallas anchas (web escritorio/tablet); en web
  // móvil se usa la barra inferior igual que en nativo.
  const isDesktopLike = width >= 768;

  // Espacio reservado por las barras flotantes + safe areas del dispositivo.
  const topPadding = isDesktopLike ? layoutTokens.topNavHeight + insets.top : insets.top + spacingTokens.sm;
  const bottomPadding = isDesktopLike ? insets.bottom : layoutTokens.bottomTabHeight + insets.bottom;

  const fetchMyProfile = useUserProfileStore((state) => state.fetchMyProfile);
  const { userId: authUserId, hasHydrated, hydrateSession, signOut } = useAuthStore();
  const [accountBlocked, setAccountBlocked] = useState(false);

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  // La API responde 403 a las cuentas bloqueadas desde el backoffice: en vez de errores
  // sueltos en cada pantalla se muestra un aviso único con la opción de cerrar sesión.
  useEffect(() => onAccountBlocked(() => setAccountBlocked(true)), []);

  useEffect(() => {
    setAccountBlocked(false);
  }, [authUserId]);

  const openTripsTab = useCallback(() => changeTab('trips'), [changeTab]);
  usePushNotifications(authUserId, openTripsTab);

  useEffect(() => {
    if (!authUserId) {
      activeTabRef.current = 'explore';
      setActiveTab('explore');
      return;
    }

    void fetchMyProfile();
  }, [authUserId, fetchMyProfile]);

  if (webRecoveryTokens) {
    return (
      <View style={styles.container}>
        <PasswordResetScreen tokens={webRecoveryTokens} topInset={insets.top} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (webLegalDoc) {
    return (
      <View style={styles.container}>
        <LegalPage doc={webLegalDoc} topInset={insets.top} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!hasHydrated) {
    return <SplashView />;
  }

  if (!authUserId) {
    return (
      <View style={styles.container}>
        <AuthScreen topInset={insets.top} bottomInset={insets.bottom} />
        <ToastHost />
        <ConfirmHost />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (accountBlocked) {
    return (
      <View style={styles.container}>
        <AccountBlockedScreen topInset={insets.top} onSignOut={() => void signOut()} />
        <StatusBar style="dark" />
      </View>
    );
  }

  const screenProps = { topPadding, bottomPadding, onNavigateToTab: changeTab };

  return (
    <View style={styles.container}>
      <ScreenTransition transitionKey={activeTab} direction={tabDirection}>
        {activeTab === 'explore' ? <ExploreScreen {...screenProps} /> : null}
        {activeTab === 'trips' ? <TripsScreen {...screenProps} /> : null}
        {activeTab === 'myVehicles' ? <MyVehiclesScreen {...screenProps} /> : null}
        {activeTab === 'profile' ? <ProfileScreen {...screenProps} /> : null}
      </ScreenTransition>

      <TabBar activeTab={activeTab} onChangeTab={changeTab} bottom={!isDesktopLike} />

      <ToastHost bottomOffset={isDesktopLike ? 0 : layoutTokens.bottomTabHeight} />
      <ConfirmHost />
      <StatusBar style="dark" />
    </View>
  );
}

function SplashView() {
  return (
    <View style={[styles.container, styles.splash]}>
      <View style={styles.splashMark}>
        <Text style={styles.splashLetter}>L</Text>
      </View>
      <Text style={styles.splashTitle}>LynkDrive</Text>
      <ActivityIndicator color={colorTokens.accent2} style={{ marginTop: spacingTokens.lg }} />
      <StatusBar style="dark" />
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold
  });
  const [fontTimeout, setFontTimeout] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setFontTimeout(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  const ready = fontsLoaded || !!fontError || fontTimeout;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [ready]);

  return (
    <SafeAreaProvider>
      {ready ? <AppShell /> : <View style={styles.container} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colorTokens.bgLight
  },
  splash: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingTokens.sm
  },
  splashMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colorTokens.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  splashLetter: {
    color: colorTokens.accent1,
    ...typographyTokens.title,
    lineHeight: undefined
  },
  splashTitle: {
    color: colorTokens.primary,
    ...typographyTokens.h2
  }
});
