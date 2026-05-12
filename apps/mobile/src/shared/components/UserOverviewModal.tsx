import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { httpClient } from '../../api/http';
import { resolveStoredImageUrl } from '../../api/storage';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';

type UserOverviewResponse = {
  userId: string;
  completedTripsAsDriver: number;
  completedTripsAsOwner: number;
  averageRating: number | null;
  ratingsCount: number;
};

type UserOverviewModalProps = {
  visible: boolean;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  onClose: () => void;
};

function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase() || 'U';
}

export function UserOverviewModal({
  visible,
  userId,
  displayName,
  avatarUrl,
  onClose
}: UserOverviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<UserOverviewResponse | null>(null);

  const resolvedAvatarUrl = useMemo(() => resolveStoredImageUrl(avatarUrl), [avatarUrl]);

  useEffect(() => {
    if (!visible || !userId) {
      return;
    }

    let isCancelled = false;

    const loadOverview = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await httpClient.get<UserOverviewResponse>(`/users/${userId}/overview`);

        if (!isCancelled) {
          setOverview(response.data);
        }
      } catch {
        if (!isCancelled) {
          setError('No se pudo cargar el resumen del usuario.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadOverview();

    return () => {
      isCancelled = true;
    };
  }, [visible, userId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={localStyles.backdrop}>
        <View style={localStyles.card}>
          <View style={localStyles.headerRow}>
            <Text style={localStyles.title}>Perfil del usuario</Text>
            <Pressable onPress={onClose} style={localStyles.closeButton}>
              <Text style={localStyles.closeButtonText}>Cerrar</Text>
            </Pressable>
          </View>

          <View style={localStyles.profileRow}>
            {resolvedAvatarUrl ? (
              <Image source={{ uri: resolvedAvatarUrl }} style={localStyles.avatar} resizeMode="cover" />
            ) : (
              <View style={localStyles.avatarFallback}>
                <Text style={localStyles.avatarFallbackText}>{getInitials(displayName)}</Text>
              </View>
            )}
            <View style={localStyles.profileInfo}>
              <Text style={localStyles.name}>{displayName}</Text>
              <Text style={localStyles.caption}>Resumen publico de actividad</Text>
            </View>
          </View>

          {loading ? <ActivityIndicator size="small" /> : null}
          {error ? <Text style={localStyles.errorText}>{error}</Text> : null}

          {!loading && !error && overview ? (
            <View style={localStyles.statsBlock}>
              <View style={localStyles.statRow}>
                <Text style={localStyles.statLabel}>Viajes completados como conductor</Text>
                <Text style={localStyles.statValue}>{overview.completedTripsAsDriver}</Text>
              </View>
              <View style={localStyles.statRow}>
                <Text style={localStyles.statLabel}>Reservas completadas como propietario</Text>
                <Text style={localStyles.statValue}>{overview.completedTripsAsOwner}</Text>
              </View>
              <View style={localStyles.statRow}>
                <Text style={localStyles.statLabel}>Valoracion media</Text>
                <Text style={localStyles.statValue}>
                  {overview.averageRating === null ? 'Sin valoraciones' : `${overview.averageRating.toFixed(1)} / 5`}
                </Text>
              </View>
              <Text style={localStyles.caption}>Basado en {overview.ratingsCount} valoraciones.</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,15,20,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacingTokens.lg
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.lg,
    gap: spacingTokens.md
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  title: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  closeButton: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.pill,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs
  },
  closeButtonText: {
    color: colorTokens.secondary,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarFallbackText: {
    color: colorTokens.primary,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  profileInfo: {
    flex: 1,
    gap: 2
  },
  name: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  statsBlock: {
    gap: spacingTokens.sm,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    padding: spacingTokens.md,
    backgroundColor: colorTokens.white
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  statLabel: {
    flex: 1,
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  statValue: {
    color: colorTokens.primary,
    ...typographyTokens.body,
    fontWeight: '700'
  },
  caption: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  errorText: {
    color: colorTokens.alert,
    ...typographyTokens.caption
  }
});
