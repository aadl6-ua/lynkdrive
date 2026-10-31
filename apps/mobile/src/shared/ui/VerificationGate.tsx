import { StyleProp, ViewStyle } from 'react-native';
import { InlineMessage } from './States';

type VerificationGateProps = {
  /** Falta nombre, apellidos o teléfono. */
  missingProfile: boolean;
  /** Falta verificación documental (is_verified). */
  missingVerification: boolean;
  onGoToProfile?: () => void;
  action?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Aviso reutilizable para acciones transaccionales bloqueadas: explica el
 * motivo y lleva directo a Perfil para completarlo.
 */
export function VerificationGate({
  missingProfile,
  missingVerification,
  onGoToProfile,
  action = 'reservar y gestionar viajes',
  style
}: VerificationGateProps) {
  if (!missingProfile && !missingVerification) {
    return null;
  }

  if (missingProfile) {
    return (
      <InlineMessage
        tone="warning"
        title="Completa tu perfil"
        message={`Para ${action} necesitamos tu nombre, apellidos y teléfono.`}
        actionLabel={onGoToProfile ? 'Ir a Perfil' : undefined}
        onAction={onGoToProfile}
        style={style}
      />
    );
  }

  return (
    <InlineMessage
      tone="warning"
      title="Verificación pendiente"
      message={`Para ${action} tu documentación (DNI y carnet) debe estar verificada.`}
      actionLabel={onGoToProfile ? 'Ir a Documentación' : undefined}
      onAction={onGoToProfile}
      style={style}
    />
  );
}
