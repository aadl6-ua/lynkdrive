import { Button, View } from 'react-native';
import { EmptyState } from './EmptyState';

type VerificationGateProps = {
  onGoToProfile: () => void;
};

export function VerificationGate({ onGoToProfile }: VerificationGateProps) {
  return (
    <View style={{ gap: 8 }}>
      <EmptyState
        title="Verificacion pendiente"
        description="Para solicitar o gestionar reservas debes completar y verificar tu documentacion en Perfil."
      />
      <View style={{ alignSelf: 'flex-start' }}>
        <Button title="Ir a Perfil" onPress={onGoToProfile} />
      </View>
    </View>
  );
}
