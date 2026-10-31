import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { httpClient } from '../../api/http';
import { resolveStoredImageUrl } from '../../api/storage';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { getApiErrorMessage } from '../errors';
import { pluralize } from '../format';
import { Avatar, ErrorState, Sheet, Skeleton, StarRating } from '../ui';

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

/** Resumen público de otro usuario (propietario o conductor). */
export function UserOverviewModal({ visible, userId, displayName, avatarUrl, onClose }: UserOverviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<UserOverviewResponse | null>(null);

  const resolvedAvatarUrl = useMemo(() => resolveStoredImageUrl(avatarUrl), [avatarUrl]);

  const loadOverview = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!userId) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await httpClient.get<UserOverviewResponse>(`/users/${userId}/overview`);

        if (!isCancelled()) {
          setOverview(response.data);
        }
      } catch (fetchError: unknown) {
        if (!isCancelled()) {
          setError(getApiErrorMessage(fetchError, 'No se pudo cargar el resumen del usuario.'));
        }
      } finally {
        if (!isCancelled()) {
          setLoading(false);
        }
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!visible || !userId) {
      return;
    }

    let cancelled = false;
    setOverview(null);
    void loadOverview(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [visible, userId, loadOverview]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Perfil del usuario" centered>
      <View style={styles.identity}>
        <Avatar uri={resolvedAvatarUrl} name={displayName} size={64} />
        <View style={styles.identityText}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.caption}>Resumen público de actividad</Text>
        </View>
      </View>

      {loading && !overview ? (
        <View style={styles.stats}>
          <Skeleton height={64} radius={radiusTokens.card} />
          <Skeleton height={64} radius={radiusTokens.card} />
        </View>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => void loadOverview()} retrying={loading} /> : null}

      {!error && overview ? (
        <View style={styles.stats}>
          <View style={styles.ratingBox}>
            {overview.averageRating === null ? (
              <Text style={styles.caption}>Todavía no tiene valoraciones</Text>
            ) : (
              <>
                <Text style={styles.ratingValue}>{overview.averageRating.toFixed(1)}</Text>
                <View style={styles.ratingMeta}>
                  <StarRating value={overview.averageRating} size={18} />
                  <Text style={styles.caption}>{pluralize(overview.ratingsCount, 'valoración', 'valoraciones')}</Text>
                </View>
              </>
            )}
          </View>
          <View style={styles.statRow}>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{overview.completedTripsAsDriver}</Text>
              <Text style={styles.statLabel}>Viajes como conductor</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{overview.completedTripsAsOwner}</Text>
              <Text style={styles.statLabel}>Alquileres como propietario</Text>
            </View>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md
  },
  identityText: {
    flex: 1,
    gap: 2
  },
  name: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  caption: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  stats: {
    gap: spacingTokens.sm
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    padding: spacingTokens.lg,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.bgLight,
    borderWidth: 1,
    borderColor: colorTokens.border
  },
  ratingValue: {
    color: colorTokens.primary,
    ...typographyTokens.title
  },
  ratingMeta: {
    gap: 4
  },
  statRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  statTile: {
    flex: 1,
    padding: spacingTokens.md,
    borderRadius: radiusTokens.card,
    borderWidth: 1,
    borderColor: colorTokens.border,
    gap: 2
  },
  statValue: {
    color: colorTokens.primary,
    ...typographyTokens.h2
  },
  statLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  }
});
