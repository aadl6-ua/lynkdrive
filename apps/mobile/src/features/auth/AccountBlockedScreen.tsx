import { StyleSheet, View } from 'react-native';
import { layoutTokens, spacingTokens } from '../../app/theme/tokens';
import { LEGAL_CONTACT_EMAIL } from '../../shared/legal';
import { EmptyState } from '../../shared/ui';

type AccountBlockedScreenProps = {
  topInset: number;
  onSignOut: () => void;
};

/** Pantalla para cuentas bloqueadas desde el backoffice: la API rechaza todas sus peticiones. */
export function AccountBlockedScreen({ topInset, onSignOut }: AccountBlockedScreenProps) {
  return (
    <View style={[styles.container, { paddingTop: topInset + spacingTokens.xl }]}>
      <EmptyState
        icon="lock-closed-outline"
        title="Cuenta bloqueada"
        description={`La administración de LynkDrive ha bloqueado tu cuenta y no puedes usar la app. Si crees que es un error, escríbenos a ${LEGAL_CONTACT_EMAIL} desde el email de tu cuenta.`}
        actionLabel="Cerrar sesión"
        onAction={onSignOut}
        style={styles.card}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacingTokens.lg,
    alignItems: 'center'
  },
  card: {
    width: '100%',
    maxWidth: layoutTokens.formMaxWidth
  }
});
