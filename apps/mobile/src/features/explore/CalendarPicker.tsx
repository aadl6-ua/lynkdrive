import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colorTokens, HIT_SIZE, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { getBillableDays, madridWallTimeToDate, pluralize } from '../../shared/format';
import {
  AvailabilityWindowItem,
  BookingItem,
  DayStatus,
  getDayStatus,
  getFilterDayStatus,
  getOwnerDayStatus
} from './calendarAvailability';
import { IconButton } from '../../shared/ui';

type DateRange = {
  startDate: Date | null;
  startHour: number;
  endDate: Date | null;
  endHour: number;
};

interface CalendarPickerProps {
  availabilityWindows: AvailabilityWindowItem[];
  bookings: BookingItem[];
  onDateRangeChange: (startDate: Date | null, startHour: number, endDate: Date | null, endHour: number) => void;
  initialDateRange?: {
    startDate: Date | null;
    startHour: number;
    endDate: Date | null;
    endHour: number;
  };
  /** explore: disponibilidad del vehículo; owner: ventanas publicadas; filter: solo fechas (Explorar). */
  mode?: 'explore' | 'owner' | 'filter';
}

type PickerMode = 'start' | 'end' | null;

const MIN_HOUR = 9;
const MAX_HOUR = 20;
const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

const DOT_COLOR: Record<DayStatus, string> = {
  available: colorTokens.success,
  partial: colorTokens.accent2,
  unavailable: colorTokens.borderStrong,
  past: 'transparent'
};

function formatFieldDate(date: Date | null): string {
  if (!date) {
    return 'Elegir fecha';
  }

  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3).toLowerCase()} ${date.getFullYear()}`;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function clampHour(hour: number): number {
  return Math.min(MAX_HOUR, Math.max(MIN_HOUR, hour));
}

function isSameDay(a: Date | null, b: Date): boolean {
  return !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type RangeFieldProps = {
  label: string;
  date: Date | null;
  hour: number;
  active: boolean;
  onPress: () => void;
  onHourChange: (hour: number) => void;
};

function RangeField({ label, date, hour, active, onPress, onHourChange }: RangeFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${date ? formatFieldDate(date) : 'sin fecha'}`}
        accessibilityHint="Abre el calendario"
        accessibilityState={{ expanded: active }}
        style={({ pressed }) => [styles.fieldButton, active ? styles.fieldButtonActive : null, pressed ? styles.pressed : null]}
      >
        <Ionicons name="calendar-outline" size={18} color={active ? colorTokens.accent2 : colorTokens.textMuted} />
        <Text style={[styles.fieldValue, !date ? styles.fieldPlaceholder : null]} numberOfLines={1}>
          {formatFieldDate(date)}
        </Text>
      </Pressable>
      <View style={styles.hourRow} accessibilityLabel={`Hora de ${label.toLowerCase()}: ${formatHour(hour)}`}>
        <IconButton
          icon="remove"
          size={36}
          accessibilityLabel={`Restar una hora a ${label.toLowerCase()}`}
          onPress={() => onHourChange(clampHour(hour - 1))}
          disabled={hour <= MIN_HOUR}
        />
        <Text style={styles.hourValue}>{formatHour(hour)}</Text>
        <IconButton
          icon="add"
          size={36}
          accessibilityLabel={`Sumar una hora a ${label.toLowerCase()}`}
          onPress={() => onHourChange(clampHour(hour + 1))}
          disabled={hour >= MAX_HOUR}
        />
      </View>
    </View>
  );
}

export const CalendarPicker = React.memo(
  ({ availabilityWindows, bookings, onDateRangeChange, initialDateRange, mode = 'explore' }: CalendarPickerProps) => {
    const [dateRange, setDateRange] = useState<DateRange>({
      startDate: null,
      startHour: 10,
      endDate: null,
      endHour: 18
    });
    const [pickerMode, setPickerMode] = useState<PickerMode>(null);
    const [activeMonthIndex, setActiveMonthIndex] = useState(0);
    const onDateRangeChangeRef = useRef(onDateRangeChange);
    const lastInitialRangeSignatureRef = useRef<string | null>(null);

    const months = useMemo(() => {
      const now = new Date();
      return Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() + index, 1));
    }, []);

    useEffect(() => {
      onDateRangeChangeRef.current = onDateRangeChange;
    }, [onDateRangeChange]);

    useEffect(() => {
      onDateRangeChangeRef.current(dateRange.startDate, dateRange.startHour, dateRange.endDate, dateRange.endHour);
    }, [dateRange]);

    useEffect(() => {
      if (!initialDateRange) {
        return;
      }

      const nextSignature = [
        initialDateRange.startDate?.toISOString() ?? '',
        initialDateRange.startHour,
        initialDateRange.endDate?.toISOString() ?? '',
        initialDateRange.endHour
      ].join('|');

      if (lastInitialRangeSignatureRef.current === nextSignature) {
        return;
      }

      lastInitialRangeSignatureRef.current = nextSignature;
      setDateRange({ ...initialDateRange });
    }, [initialDateRange]);

    const activeMonth = months[activeMonthIndex];
    const year = activeMonth.getFullYear();
    const month = activeMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

    const dayStatuses = useMemo(() => {
      return Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(year, month, index + 1);

        if (mode === 'owner') {
          return getOwnerDayStatus(date, availabilityWindows);
        }

        if (mode === 'filter') {
          return getFilterDayStatus(date);
        }

        return getDayStatus(date, availabilityWindows, bookings);
      });
    }, [availabilityWindows, bookings, daysInMonth, mode, month, year]);

    const jumpToMonthOf = (date: Date | null) => {
      if (!date) {
        return;
      }

      const now = new Date();
      const offset = (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());

      if (offset >= 0 && offset < months.length) {
        setActiveMonthIndex(offset);
      }
    };

    const togglePicker = (target: Exclude<PickerMode, null>) => {
      setPickerMode((prev) => (prev === target ? null : target));
      jumpToMonthOf(target === 'start' ? dateRange.startDate : dateRange.endDate ?? dateRange.startDate);
    };

    const handleDayPress = (day: Date) => {
      setDateRange((prev) => {
        if (pickerMode === 'start') {
          const nextEndDate = prev.endDate && day > prev.endDate ? null : prev.endDate;
          return { ...prev, startDate: day, endDate: nextEndDate };
        }

        if (prev.startDate && day < prev.startDate) {
          return { ...prev, startDate: day, endDate: prev.startDate };
        }

        return { ...prev, endDate: day };
      });

      // Tras elegir inicio pasamos directamente a elegir fin.
      setPickerMode((current) => (current === 'start' && !dateRange.endDate ? 'end' : null));
    };

    const summary =
      dateRange.startDate && dateRange.endDate
        ? (() => {
            const start = madridWallTimeToDate(
              dateRange.startDate.getFullYear(),
              dateRange.startDate.getMonth(),
              dateRange.startDate.getDate(),
              dateRange.startHour
            );
            const end = madridWallTimeToDate(
              dateRange.endDate.getFullYear(),
              dateRange.endDate.getMonth(),
              dateRange.endDate.getDate(),
              dateRange.endHour
            );
            return end.getTime() > start.getTime() ? getBillableDays(start, end) : null;
          })()
        : null;

    const rangeInvalid = !!dateRange.startDate && !!dateRange.endDate && summary === null;

    return (
      <View style={styles.container}>
        <View style={styles.fieldsRow}>
          <RangeField
            label="Desde"
            date={dateRange.startDate}
            hour={dateRange.startHour}
            active={pickerMode === 'start'}
            onPress={() => togglePicker('start')}
            onHourChange={(hour) => setDateRange((prev) => ({ ...prev, startHour: hour }))}
          />
          <RangeField
            label="Hasta"
            date={dateRange.endDate}
            hour={dateRange.endHour}
            active={pickerMode === 'end'}
            onPress={() => togglePicker('end')}
            onHourChange={(hour) => setDateRange((prev) => ({ ...prev, endHour: hour }))}
          />
        </View>

        {pickerMode ? (
          <View style={styles.monthCard}>
            <View style={styles.monthHeader}>
              <IconButton
                icon="chevron-back"
                size={36}
                accessibilityLabel="Mes anterior"
                onPress={() => setActiveMonthIndex((prev) => Math.max(0, prev - 1))}
                disabled={activeMonthIndex === 0}
              />
              <Text style={styles.monthTitle} accessibilityRole="header">
                {MONTH_NAMES[month]} {year}
              </Text>
              <IconButton
                icon="chevron-forward"
                size={36}
                accessibilityLabel="Mes siguiente"
                onPress={() => setActiveMonthIndex((prev) => Math.min(months.length - 1, prev + 1))}
                disabled={activeMonthIndex === months.length - 1}
              />
            </View>

            <Text style={styles.pickerHint}>
              {pickerMode === 'start' ? 'Elige el día de inicio' : 'Elige el día de fin'}
            </Text>

            <View style={styles.weekRow}>
              {WEEK_DAYS.map((day) => (
                <Text key={day} style={styles.weekDay}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {Array.from({ length: firstDayOfWeek }).map((_, index) => (
                <View key={`empty-${index}`} style={styles.dayCell} />
              ))}

              {dayStatuses.map((status, index) => {
                const date = new Date(year, month, index + 1);
                const isStart = isSameDay(dateRange.startDate, date);
                const isEnd = isSameDay(dateRange.endDate, date);
                const isEdge = isStart || isEnd;
                const isInRange =
                  !!dateRange.startDate && !!dateRange.endDate && date > dateRange.startDate && date < dateRange.endDate;
                const isDisabled = status === 'past' || (mode === 'explore' && status === 'unavailable');

                return (
                  <View key={index} style={[styles.dayCell, isInRange ? styles.dayCellInRange : null]}>
                    <Pressable
                      onPress={() => handleDayPress(date)}
                      disabled={isDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={`${index + 1} de ${MONTH_NAMES[month]}`}
                      accessibilityState={{ disabled: isDisabled, selected: isEdge }}
                      style={({ pressed }) => [
                        styles.dayButton,
                        isEdge ? styles.dayButtonSelected : null,
                        pressed && !isEdge ? styles.dayButtonPressed : null
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          isDisabled ? styles.dayNumberDisabled : null,
                          isEdge ? styles.dayNumberSelected : null
                        ]}
                      >
                        {index + 1}
                      </Text>
                      <View
                        style={[
                          styles.dayDot,
                          { backgroundColor: isEdge ? colorTokens.accent1 : mode === 'filter' ? 'transparent' : DOT_COLOR[status] }
                        ]}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {mode === 'explore' ? (
              <View style={styles.legend}>
                <LegendItem color={colorTokens.success} label="Disponible" />
                <LegendItem color={colorTokens.accent2} label="Parcial" />
                <LegendItem color={colorTokens.borderStrong} label="Sin disponibilidad" />
              </View>
            ) : mode === 'owner' ? (
              <View style={styles.legend}>
                <LegendItem color={colorTokens.success} label="Ya tiene disponibilidad" />
                <LegendItem color={colorTokens.borderStrong} label="Sin ventana" />
              </View>
            ) : null}
          </View>
        ) : null}

        {summary !== null ? (
          <View style={styles.summary}>
            <Ionicons name="time-outline" size={18} color={colorTokens.primary} />
            <Text style={styles.summaryText}>
              {formatFieldDate(dateRange.startDate)} · {formatHour(dateRange.startHour)} → {formatFieldDate(dateRange.endDate)} ·{' '}
              {formatHour(dateRange.endHour)}
              {mode !== 'owner' ? `  (${pluralize(summary, 'día', 'días')})` : ''}
            </Text>
          </View>
        ) : null}

        {rangeInvalid ? (
          <Text style={styles.invalid}>La hora de fin debe ser posterior a la de inicio.</Text>
        ) : null}

        <Text style={styles.timezoneNote}>Horario peninsular (Madrid).</Text>
      </View>
    );
  }
);

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

CalendarPicker.displayName = 'CalendarPicker';

const styles = StyleSheet.create({
  container: {
    gap: spacingTokens.md
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: spacingTokens.md
  },
  field: {
    flex: 1,
    gap: 6
  },
  fieldLabel: {
    color: colorTokens.secondary,
    ...typographyTokens.captionStrong
  },
  fieldButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.white,
    paddingHorizontal: spacingTokens.md
  },
  fieldButtonActive: {
    borderColor: colorTokens.primary,
    borderWidth: 1.5
  },
  pressed: {
    backgroundColor: colorTokens.bgLight
  },
  fieldValue: {
    flex: 1,
    color: colorTokens.textMain,
    ...typographyTokens.bodyStrong
  },
  fieldPlaceholder: {
    color: colorTokens.textSubtle,
    ...typographyTokens.body
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingTokens.xs
  },
  hourValue: {
    flex: 1,
    textAlign: 'center',
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  monthCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.md,
    gap: spacingTokens.sm
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  monthTitle: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  pickerHint: {
    textAlign: 'center',
    color: colorTokens.accent2,
    ...typographyTokens.captionStrong
  },
  weekRow: {
    flexDirection: 'row'
  },
  weekDay: {
    width: '14.2857%',
    textAlign: 'center',
    color: colorTokens.textMuted,
    ...typographyTokens.captionStrong
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2
  },
  dayCell: {
    width: '14.2857%',
    height: HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayCellInRange: {
    backgroundColor: colorTokens.infoSoft
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayButtonSelected: {
    backgroundColor: colorTokens.primary
  },
  dayButtonPressed: {
    backgroundColor: colorTokens.surfaceMuted
  },
  dayNumber: {
    color: colorTokens.textMain,
    ...typographyTokens.captionStrong,
    fontSize: 14
  },
  dayNumberDisabled: {
    color: colorTokens.borderStrong
  },
  dayNumberSelected: {
    color: colorTokens.white
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 1
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacingTokens.md,
    paddingTop: spacingTokens.xs
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  legendText: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    padding: spacingTokens.md,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.infoSoft
  },
  summaryText: {
    flex: 1,
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  invalid: {
    color: colorTokens.alertText,
    ...typographyTokens.caption
  },
  timezoneNote: {
    color: colorTokens.textSubtle,
    ...typographyTokens.caption
  }
});
