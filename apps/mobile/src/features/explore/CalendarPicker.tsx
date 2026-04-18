import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colorTokens, spacingTokens, typographyTokens, radiusTokens } from '../../app/theme/tokens';

type AvailabilityWindowItem = {
  id: string;
  startDatetime: string;
  endDatetime: string;
};

type BookingItem = {
  id: string;
  startDatetime: string;
  endDatetime: string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';
};

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
}

type DayStatus = 'past' | 'unavailable' | 'partial' | 'available';
type PickerMode = 'start' | 'end' | null;

function getDayStatus(
  date: Date,
  availabilityWindows: AvailabilityWindowItem[],
  bookings: BookingItem[]
): DayStatus {
  const now = new Date();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Si la fecha es pasada, gris oscuro
  if (endOfDay < now) {
    return 'past';
  }

  // Buscar ventanas de disponibilidad que toquen este día
  const relevantWindows = availabilityWindows.filter((window) => {
    const winStart = new Date(window.startDatetime);
    const winEnd = new Date(window.endDatetime);
    return winStart <= endOfDay && winEnd >= startOfDay;
  });

  if (relevantWindows.length === 0) {
    return 'unavailable';
  }

  // Buscar reservas confirmadas que toquen este día (no pending)
  const confirmedBookings = bookings.filter((booking) => {
    if (booking.status === 'pending' || booking.status === 'rejected' || booking.status === 'cancelled') {
      return false;
    }
    const bookStart = new Date(booking.startDatetime);
    const bookEnd = new Date(booking.endDatetime);
    // Agregar 2h operativas de bloqueo
    bookEnd.setHours(bookEnd.getHours() + 2);
    return bookStart <= endOfDay && bookEnd >= startOfDay;
  });

  // Calcular horas libres: intersection de ventanas con día, menos horas ocupadas
  let totalFreeHours = 0;

  for (const window of relevantWindows) {
    const winStart = new Date(window.startDatetime);
    const winEnd = new Date(window.endDatetime);

    // Intersection con el día
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const realStart = Math.max(winStart.getTime(), dayStart.getTime());
    const realEnd = Math.min(winEnd.getTime(), dayEnd.getTime());

    if (realEnd > realStart) {
      let windowHours = (realEnd - realStart) / (1000 * 60 * 60);

      // Restar horas ocupadas por reservas
      for (const booking of confirmedBookings) {
        const bookStart = new Date(booking.startDatetime);
        const bookEnd = new Date(booking.endDatetime);
        bookEnd.setHours(bookEnd.getHours() + 2);

        const occupyStart = Math.max(bookStart.getTime(), realStart);
        const occupyEnd = Math.min(bookEnd.getTime(), realEnd);

        if (occupyEnd > occupyStart) {
          windowHours -= (occupyEnd - occupyStart) / (1000 * 60 * 60);
        }
      }

      totalFreeHours += Math.max(0, windowHours);
    }
  }

  // Si >= 10h continuas, verde. Si < 10h, naranja
  if (totalFreeHours >= 10) {
    return 'available';
  } else if (totalFreeHours > 0) {
    return 'partial';
  }

  return 'unavailable';
}

function getDayColor(status: DayStatus): string {
  if (status === 'available') return colorTokens.success; // Verde
  if (status === 'partial') return colorTokens.accent2; // Naranja
  if (status === 'past') return '#CCCCCC'; // Gris claro (fecha pasada)
  return '#E8E8E8'; // Gris (sin disponibilidad)
}

function getDayBackgroundColor(_status: DayStatus, isSelected: boolean): string {
  if (isSelected) {
    return colorTokens.primary;
  }
  return 'transparent';
}

function formatFieldDate(date: Date | null): string {
  if (!date) {
    return '--/--/----';
  }
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function adjustHour(currentHour: number, delta: number): number {
  const nextHour = currentHour + delta;
  if (nextHour < 9) return 9;
  if (nextHour > 20) return 20;
  return nextHour;
}

function formatMonthYear(date: Date): string {
  const month = date
    .toLocaleDateString('es-ES', { month: 'long' })
    .replace(/^./, (character) => character.toUpperCase());
  const year = date.toLocaleDateString('es-ES', { year: 'numeric' });

  return `${month} ${year}`;
}

export const CalendarPicker = React.memo(
  ({ availabilityWindows, bookings, onDateRangeChange, initialDateRange }: CalendarPickerProps) => {
    const [dateRange, setDateRange] = useState<DateRange>({
      startDate: null,
      startHour: 10,
      endDate: null,
      endHour: 18
    });
    const [pickerMode, setPickerMode] = useState<PickerMode>(null);
    const [activeMonthIndex, setActiveMonthIndex] = useState(0);

    const months = useMemo(() => {
      const result = [];
      const now = new Date();
      for (let i = 0; i < 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
        result.push(date);
      }
      return result;
    }, []);

    useEffect(() => {
      onDateRangeChange(dateRange.startDate, dateRange.startHour, dateRange.endDate, dateRange.endHour);
    }, [dateRange, onDateRangeChange]);

    useEffect(() => {
      if (!initialDateRange) {
        return;
      }

      setDateRange({
        startDate: initialDateRange.startDate,
        startHour: initialDateRange.startHour,
        endDate: initialDateRange.endDate,
        endHour: initialDateRange.endHour
      });
    }, [initialDateRange]);

    const handleDayPress = (day: Date) => {
      const dayOnly = new Date(day);
      dayOnly.setHours(0, 0, 0, 0);

      setDateRange((prev) => {
        if (pickerMode === 'start') {
          const nextEndDate = prev.endDate && dayOnly > prev.endDate ? null : prev.endDate;
          return {
            ...prev,
            startDate: dayOnly,
            endDate: nextEndDate
          };
        }

        if (pickerMode === 'end') {
          if (prev.startDate && dayOnly < prev.startDate) {
            return {
              ...prev,
              startDate: dayOnly,
              endDate: prev.startDate
            };
          }

          return {
            ...prev,
            endDate: dayOnly
          };
        }

        if (!prev.startDate) {
          return {
            ...prev,
            startDate: dayOnly
          };
        }

        if (!prev.endDate) {
          if (dayOnly < prev.startDate) {
            return {
              ...prev,
              startDate: dayOnly,
              endDate: prev.startDate
            };
          }
          return {
            ...prev,
            endDate: dayOnly
          };
        }

        return {
          ...prev,
          startDate: dayOnly,
          endDate: null
        };
      });

      if (pickerMode) {
        setPickerMode(null);
      }
    };

    const activeMonth = months[activeMonthIndex];
    const year = activeMonth.getFullYear();
    const month = activeMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const firstDayOfWeek = (firstDay + 6) % 7;

    return (
      <View style={localStyles.container}>
        <Text style={localStyles.sectionLabel}>Selecciona fechas</Text>

        <View style={localStyles.rangeInputsRow}>
          <View style={localStyles.rangeInputColumn}>
            <Text style={localStyles.rangeInputLabel}>Desde</Text>
            <Pressable
              style={[localStyles.rangeInputButton, pickerMode === 'start' ? localStyles.rangeInputButtonActive : null]}
              onPress={() => {
                setPickerMode((prev) => (prev === 'start' ? null : 'start'));
                if (dateRange.startDate) {
                  const now = new Date();
                  const monthOffset =
                    (dateRange.startDate.getFullYear() - now.getFullYear()) * 12 +
                    (dateRange.startDate.getMonth() - now.getMonth());
                  if (monthOffset >= 0 && monthOffset < 6) {
                    setActiveMonthIndex(monthOffset);
                  }
                }
              }}
            >
              <Text style={localStyles.rangeInputValue}>{formatFieldDate(dateRange.startDate)}</Text>
              <Text style={localStyles.rangeInputHour}>{String(dateRange.startHour).padStart(2, '0')}:00</Text>
            </Pressable>
            <View style={localStyles.hourAdjustRow}>
              <Pressable
                style={localStyles.hourAdjustButton}
                onPress={() =>
                  setDateRange((prev) => ({
                    ...prev,
                    startHour: adjustHour(prev.startHour, -1)
                  }))
                }
              >
                <Text style={localStyles.hourAdjustButtonText}>-</Text>
              </Pressable>
              <Pressable
                style={localStyles.hourAdjustButton}
                onPress={() =>
                  setDateRange((prev) => ({
                    ...prev,
                    startHour: adjustHour(prev.startHour, 1)
                  }))
                }
              >
                <Text style={localStyles.hourAdjustButtonText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={localStyles.rangeInputColumn}>
            <Text style={localStyles.rangeInputLabel}>Hasta</Text>
            <Pressable
              style={[localStyles.rangeInputButton, pickerMode === 'end' ? localStyles.rangeInputButtonActive : null]}
              onPress={() => {
                setPickerMode((prev) => (prev === 'end' ? null : 'end'));
                if (dateRange.endDate) {
                  const now = new Date();
                  const monthOffset =
                    (dateRange.endDate.getFullYear() - now.getFullYear()) * 12 +
                    (dateRange.endDate.getMonth() - now.getMonth());
                  if (monthOffset >= 0 && monthOffset < 6) {
                    setActiveMonthIndex(monthOffset);
                  }
                }
              }}
            >
              <Text style={localStyles.rangeInputValue}>{formatFieldDate(dateRange.endDate)}</Text>
              <Text style={localStyles.rangeInputHour}>{String(dateRange.endHour).padStart(2, '0')}:00</Text>
            </Pressable>
            <View style={localStyles.hourAdjustRow}>
              <Pressable
                style={localStyles.hourAdjustButton}
                onPress={() =>
                  setDateRange((prev) => ({
                    ...prev,
                    endHour: adjustHour(prev.endHour, -1)
                  }))
                }
              >
                <Text style={localStyles.hourAdjustButtonText}>-</Text>
              </Pressable>
              <Pressable
                style={localStyles.hourAdjustButton}
                onPress={() =>
                  setDateRange((prev) => ({
                    ...prev,
                    endHour: adjustHour(prev.endHour, 1)
                  }))
                }
              >
                <Text style={localStyles.hourAdjustButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {pickerMode ? (
          <View style={localStyles.monthCard}>
          <View style={localStyles.monthHeaderRow}>
            <Pressable
              onPress={() => setActiveMonthIndex((prev) => Math.max(0, prev - 1))}
              disabled={activeMonthIndex === 0}
              style={[localStyles.monthNavButton, activeMonthIndex === 0 ? localStyles.monthNavButtonDisabled : null]}
            >
              <Text style={localStyles.monthNavButtonText}>{'<'}</Text>
            </Pressable>

            <Text style={localStyles.monthTitle}>{formatMonthYear(activeMonth)}</Text>

            <Pressable
              onPress={() => setActiveMonthIndex((prev) => Math.min(months.length - 1, prev + 1))}
              disabled={activeMonthIndex === months.length - 1}
              style={[
                localStyles.monthNavButton,
                activeMonthIndex === months.length - 1 ? localStyles.monthNavButtonDisabled : null
              ]}
            >
              <Text style={localStyles.monthNavButtonText}>{'>'}</Text>
            </Pressable>
          </View>

          <View style={localStyles.weekDaysRow}>
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => (
              <Text key={day} style={localStyles.weekDayLabel}>
                {day}
              </Text>
            ))}
          </View>

          <View style={localStyles.daysGrid}>
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <View key={`empty-${i}`} style={localStyles.dayCell} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
              const day = dayIdx + 1;
              const date = new Date(year, month, day);
              const status = getDayStatus(date, availabilityWindows, bookings);
              const dayColor = getDayColor(status);
              const isStart = dateRange.startDate && date.toDateString() === dateRange.startDate.toDateString();
              const isEnd = dateRange.endDate && date.toDateString() === dateRange.endDate.toDateString();
              const isInRange =
                dateRange.startDate &&
                dateRange.endDate &&
                date > dateRange.startDate &&
                date < dateRange.endDate;
              const isDisabled = status === 'past' || status === 'unavailable';

              return (
                <Pressable
                  key={day}
                  onPress={() => handleDayPress(date)}
                  disabled={isDisabled}
                  style={[
                    localStyles.dayCell,
                    {
                      backgroundColor: isStart || isEnd ? getDayBackgroundColor(status, true) : isInRange ? '#F0F0F0' : 'transparent',
                      opacity: isDisabled ? 0.5 : 1
                    }
                  ]}
                >
                  <Text style={[localStyles.dayNumber, { color: isDisabled ? '#CCC' : colorTokens.textMain }]}>
                    {day}
                  </Text>
                  <View
                    style={[
                      localStyles.dayDot,
                      {
                        backgroundColor: dayColor
                      }
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
          </View>
        ) : null}

        {dateRange.startDate && dateRange.endDate && (
          <View style={localStyles.selectedPanel}>
            <Text style={localStyles.panelLabel}>
              Desde: {dateRange.startDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} {String(dateRange.startHour).padStart(2, '0')}:00
            </Text>
            <Text style={localStyles.panelLabel}>
              Hasta: {dateRange.endDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} {String(dateRange.endHour).padStart(2, '0')}:00
            </Text>
          </View>
        )}
      </View>
    );
  }
);

CalendarPicker.displayName = 'CalendarPicker';

const localStyles = StyleSheet.create({
  container: {
    gap: spacingTokens.md
  },
  sectionLabel: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  rangeInputsRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm
  },
  rangeInputColumn: {
    flex: 1,
    gap: spacingTokens.xs
  },
  rangeInputLabel: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  rangeInputButton: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.white,
    minHeight: 44,
    paddingHorizontal: spacingTokens.sm,
    paddingVertical: spacingTokens.xs,
    justifyContent: 'center',
    gap: 2
  },
  rangeInputButtonActive: {
    borderColor: colorTokens.primary,
    backgroundColor: colorTokens.bgLight
  },
  rangeInputValue: {
    color: colorTokens.textMain,
    ...typographyTokens.body,
    fontWeight: '600'
  },
  rangeInputHour: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  hourAdjustRow: {
    flexDirection: 'row',
    gap: spacingTokens.xs
  },
  hourAdjustButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colorTokens.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorTokens.white
  },
  hourAdjustButtonText: {
    color: colorTokens.primary,
    fontSize: 14,
    fontWeight: '700'
  },
  monthCard: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.sm
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacingTokens.sm
  },
  monthNavButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colorTokens.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  monthNavButtonDisabled: {
    opacity: 0.35
  },
  monthNavButtonText: {
    color: colorTokens.primary,
    fontSize: 14,
    fontWeight: '700'
  },
  monthTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel,
    textTransform: 'capitalize'
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacingTokens.sm
  },
  weekDayLabel: {
    width: '14.28%',
    textAlign: 'center',
    color: colorTokens.textMuted,
    ...typographyTokens.caption,
    fontWeight: '700'
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacingTokens.xs,
    columnGap: 0
  },
  dayCell: {
    width: '14.28%',
    height: 34,
    borderRadius: radiusTokens.input,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 2
  },
  dayNumber: {
    fontSize: 11,
    fontWeight: '600'
  },
  selectedPanel: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.bgLight,
    padding: spacingTokens.md,
    gap: spacingTokens.sm
  },
  panelLabel: {
    color: colorTokens.primary,
    ...typographyTokens.body,
    fontWeight: '600'
  }
});
