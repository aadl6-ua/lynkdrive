import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colorTokens, layoutTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, PAYOUT_STATUS_LABEL } from '../../shared/booking';
import { getApiErrorMessage } from '../../shared/errors';
import { formatCurrencyEUR, formatDateRangeMadrid, getMadridParts, madridWallTimeToDate, pluralize } from '../../shared/format';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineMessage,
  KeyValueRow,
  ListItemSkeleton,
  Screen,
  ScreenHeader,
  SectionTitle,
  SegmentedControl,
  Skeleton,
  StatusChip,
  type SegmentOption,
  type StatusChipTone
} from '../../shared/ui';
import { useBackHandler } from '../../shared/useBackHandler';
import { EarningsBooking, EarningsResponse, EarningsTotals, fetchMyEarnings } from './earningsApi';

type RangeKey = 'all' | 'last90' | 'year';

const RANGE_OPTIONS: Array<SegmentOption<RangeKey>> = [
  { value: 'all', label: 'Todo' },
  { value: 'last90', label: '90 días' },
  { value: 'year', label: 'Este año' }
];

const RANGE_LABEL: Record<RangeKey, string> = {
  all: 'Desde el principio',
  last90: 'Últimos 90 días',
  year: 'Año en curso'
};

const PAYOUT_TONE: Record<EarningsBooking['payoutStatus'], StatusChipTone> = {
  pending: 'warning',
  processing: 'info',
  paid: 'success',
  failed: 'danger'
};

function rangeToParams(range: RangeKey): { from?: string } {
  if (range === 'last90') {
    return { from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() };
  }

  if (range === 'year') {
    const parts = getMadridParts(new Date());
    return parts ? { from: madridWallTimeToDate(parts.year, 0, 1).toISOString() } : {};
  }

  return {};
}

type EarningsScreenProps = {
  topPadding?: number;
  bottomPadding?: number;
  onBack: () => void;
  onPublishVehicle: () => void;
};

/** Panel "Mis ingresos" del propietario: resumen por periodos, desglose por vehículo e historial. */
export function EarningsScreen({ topPadding = 0, bottomPadding = 0, onBack, onPublishVehicle }: EarningsScreenProps) {
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<RangeKey>('all');
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useBackHandler(true, onBack);

  const load = useCallback(async (selectedRange: RangeKey) => {
    const requestId = ++requestIdRef.current;
    setError(null);

    try {
      const response = await fetchMyEarnings(rangeToParams(selectedRange));
      if (requestId === requestIdRef.current) {
        setData(response);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(getApiErrorMessage(loadError, 'No se han podido cargar tus ingresos.'));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(range);
  }, [load, range]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(range);
    setRefreshing(false);
  };

  const summaryColumns = width >= 900 ? 4 : 2;
  const hasAnyEarnings = (data?.summary.total.bookings ?? 0) > 0;

  const renderBody = () => {
    if (loading && !data) {
      return <EarningsSkeleton columns={summaryColumns} />;
    }

    if (!data) {
      return <ErrorState message={error ?? 'No se han podido cargar tus ingresos.'} onRetry={() => void load(range)} />;
    }

    if (!hasAnyEarnings) {
      return (
        <EmptyState
          icon="wallet-outline"
          title="Aún no tienes ingresos"
          description="Cuando un conductor pague una reserva de tus vehículos verás aquí lo que ganas, por periodo y por vehículo."
          actionLabel="Publicar vehículo"
          onAction={onPublishVehicle}
        />
      );
    }

    return (
      <>
        {error ? (
          <InlineMessage tone="error" message={error} actionLabel="Reintentar" onAction={() => void load(range)} />
        ) : null}

        {data.mode === 'prototype' ? (
          <InlineMessage
            tone="info"
            title="Modo demostración"
            message={`Los importes se calculan con la comisión de plataforma del ${data.feePercent}% pero no se mueve dinero real.`}
          />
        ) : null}

        <View style={styles.summaryGrid}>
          <SummaryTile label="Este mes" totals={data.summary.currentMonth} columns={summaryColumns} highlight />
          <SummaryTile label="Mes anterior" totals={data.summary.previousMonth} columns={summaryColumns} />
          <SummaryTile label="Este año" totals={data.summary.currentYear} columns={summaryColumns} />
          <SummaryTile label="Total" totals={data.summary.total} columns={summaryColumns} />
        </View>

        <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />

        <Card>
          <CardHeader
            title="Resumen del periodo"
            subtitle={`${RANGE_LABEL[range]} · ${data.rangeTotals.bookings} ${pluralize(data.rangeTotals.bookings, 'reserva', 'reservas')}`}
            icon="stats-chart-outline"
          />
          <View>
            <KeyValueRow label="Cobrado a conductores" value={formatCurrencyEUR(data.rangeTotals.grossAmount)} />
            <KeyValueRow
              label={`Comisión de plataforma (${data.feePercent}%)`}
              value={`- ${formatCurrencyEUR(data.rangeTotals.platformFee)}`}
            />
            <KeyValueRow label="Tus ingresos netos" value={formatCurrencyEUR(data.rangeTotals.netAmount)} emphasis last />
          </View>
        </Card>

        {data.bookings.length === 0 ? (
          <EmptyState
            compact
            icon="calendar-outline"
            title="Sin ingresos en este periodo"
            description="Prueba con otro rango de fechas."
          />
        ) : (
          <>
            <SectionTitle title="Por vehículo" count={data.byVehicle.length} />
            <Card padding={0}>
              {data.byVehicle.map((vehicle, index) => (
                <View
                  key={vehicle.vehicleId}
                  style={[styles.vehicleRow, index < data.byVehicle.length - 1 ? styles.rowDivider : null]}
                >
                  <View style={styles.vehicleIcon}>
                    <Ionicons name="car-sport-outline" size={18} color={colorTokens.primary} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {vehicle.brand} {vehicle.model}
                    </Text>
                    <View style={styles.inlineMeta}>
                      <Text style={styles.caption}>
                        {vehicle.licensePlate} · {vehicle.bookings} {pluralize(vehicle.bookings, 'reserva', 'reservas')}
                      </Text>
                      {vehicle.isDeleted ? <StatusChip label="Retirado" compact /> : null}
                    </View>
                  </View>
                  <View style={styles.amountColumn}>
                    <Text style={styles.rowAmount}>{formatCurrencyEUR(vehicle.netAmount)}</Text>
                    <Text style={styles.caption}>de {formatCurrencyEUR(vehicle.grossAmount)}</Text>
                  </View>
                </View>
              ))}
            </Card>

            <SectionTitle title="Historial de reservas" count={data.bookings.length} />
            <View style={styles.list}>
              {data.bookings.map((booking) => (
                <BookingEarningCard key={booking.bookingId} booking={booking} />
              ))}
            </View>
          </>
        )}
      </>
    );
  };

  return (
    <Screen
      topPadding={topPadding}
      bottomPadding={bottomPadding}
      maxWidth={layoutTokens.formMaxWidth}
      refreshing={refreshing}
      onRefresh={() => void handleRefresh()}
      header={
        <ScreenHeader
          title="Mis ingresos"
          subtitle="Lo que ganas con tus vehículos, por periodo y por reserva."
          onBack={onBack}
        />
      }
    >
      {renderBody()}
    </Screen>
  );
}

function SummaryTile({
  label,
  totals,
  columns,
  highlight = false
}: {
  label: string;
  totals: EarningsTotals;
  columns: number;
  highlight?: boolean;
}) {
  const basis = columns === 4 ? '22%' : '45%';

  return (
    <Card
      variant={highlight ? 'elevated' : 'outlined'}
      padding={spacingTokens.lg}
      style={[styles.tile, { flexBasis: basis }, highlight ? styles.tileHighlight : null]}
      accessibilityLabel={`${label}: ${formatCurrencyEUR(totals.netAmount)} netos`}
    >
      <Text style={[styles.tileLabel, highlight ? styles.tileLabelHighlight : null]}>{label.toUpperCase()}</Text>
      <Text style={[styles.tileAmount, highlight ? styles.tileAmountHighlight : null]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrencyEUR(totals.netAmount)}
      </Text>
      <Text style={[styles.caption, highlight ? styles.tileCaptionHighlight : null]} numberOfLines={2}>
        {totals.bookings} {pluralize(totals.bookings, 'reserva', 'reservas')} · bruto {formatCurrencyEUR(totals.grossAmount)}
      </Text>
    </Card>
  );
}

function BookingEarningCard({ booking }: { booking: EarningsBooking }) {
  return (
    <Card>
      <View style={styles.bookingHeader}>
        <View style={styles.flex1}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {booking.vehicleLabel}
          </Text>
          <Text style={styles.caption} numberOfLines={1}>
            {booking.driver.displayName} · {formatDateRangeMadrid(booking.startDatetime, booking.endDatetime)}
          </Text>
        </View>
        <Text style={styles.rowAmount}>{formatCurrencyEUR(booking.netAmount)}</Text>
      </View>
      <View style={styles.chips}>
        <StatusChip label={BOOKING_STATUS_LABEL[booking.status]} tone={BOOKING_STATUS_TONE[booking.status]} dot compact />
        <StatusChip
          label={`Pago al propietario: ${PAYOUT_STATUS_LABEL[booking.payoutStatus]}`}
          tone={PAYOUT_TONE[booking.payoutStatus]}
          compact
        />
      </View>
      <View>
        <KeyValueRow label="Importe bruto" value={formatCurrencyEUR(booking.grossAmount)} />
        <KeyValueRow label="Comisión" value={`- ${formatCurrencyEUR(booking.platformFee)}`} />
        <KeyValueRow label="Neto" value={formatCurrencyEUR(booking.netAmount)} emphasis last />
      </View>
    </Card>
  );
}

function EarningsSkeleton({ columns }: { columns: number }) {
  const basis = columns === 4 ? '22%' : '45%';

  return (
    <View style={styles.list} accessibilityLabel="Cargando ingresos" accessible>
      <View style={styles.summaryGrid}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={index} style={[styles.tile, styles.tileSkeleton, { flexBasis: basis }]}>
            <Skeleton width="50%" height={11} />
            <Skeleton width="80%" height={26} />
            <Skeleton width="65%" height={11} />
          </View>
        ))}
      </View>
      <Skeleton height={48} radius={radiusTokens.pill} />
      <ListItemSkeleton lines={3} />
      <ListItemSkeleton lines={2} />
      <ListItemSkeleton lines={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1
  },
  list: {
    gap: spacingTokens.md
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.md
  },
  tile: {
    flexGrow: 1,
    minWidth: 140,
    gap: spacingTokens.xs
  },
  tileSkeleton: {
    padding: spacingTokens.lg,
    borderRadius: radiusTokens.card,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.white,
    gap: spacingTokens.sm
  },
  tileHighlight: {
    backgroundColor: colorTokens.primary,
    borderColor: colorTokens.primary
  },
  tileLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.overline
  },
  tileLabelHighlight: {
    color: colorTokens.accent1
  },
  tileAmount: {
    color: colorTokens.primary,
    ...typographyTokens.h2
  },
  tileAmountHighlight: {
    color: colorTokens.white
  },
  tileCaptionHighlight: {
    color: colorTokens.border
  },
  caption: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.md
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colorTokens.border
  },
  vehicleIcon: {
    width: 36,
    height: 36,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  inlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  },
  rowTitle: {
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  amountColumn: {
    alignItems: 'flex-end'
  },
  rowAmount: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacingTokens.md
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.sm
  }
});
