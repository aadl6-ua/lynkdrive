import { AsyncContent, Badge, Card, PageHeader, Pagination, Select } from '../components/ui';
import { api, buildQuery } from '../lib/api';
import { BOOKING_STATUS_LABELS, bookingTone, formatDateTime, formatMoney, fullName, shortId } from '../lib/format';
import { href, navigate, useQueryParams } from '../lib/router';
import type { AdminBooking, BookingStatus, Paginated } from '../lib/types';
import { useApi } from '../lib/useApi';

const STATUS_OPTIONS: Array<{ value: BookingStatus | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  ...(Object.entries(BOOKING_STATUS_LABELS) as Array<[BookingStatus, string]>).map(([value, label]) => ({ value, label }))
];

export function BookingsPage() {
  const [params, setParams] = useQueryParams({ page: '1', status: '' });
  const page = Number(params.page) || 1;
  const { data, loading, error, reload } = useApi(
    () => api.get<Paginated<AdminBooking>>(`/admin/bookings${buildQuery({ page, pageSize: 20, status: params.status })}`),
    [page, params.status]
  );

  return (
    <>
      <PageHeader title="Reservas" subtitle="Historial de estados y evidencias de los checklists" />
      <Card>
        <div className="toolbar">
          <Select<BookingStatus | ''> label="Estado" value={params.status as BookingStatus | ''} onChange={(status) => setParams({ status })} options={STATUS_OPTIONS} />
        </div>
        <AsyncContent data={data} loading={loading} error={error} onRetry={reload} isEmpty={(result) => result.items.length === 0}>
          {(result) => (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reserva</th>
                      <th>Vehículo</th>
                      <th>Conductor</th>
                      <th>Propietario</th>
                      <th>Inicio</th>
                      <th>Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((booking) => (
                      <tr key={booking.id} className="table__row--link" onClick={() => navigate(`/bookings/${booking.id}`)}>
                        <td className="mono">
                          <a href={href(`/bookings/${booking.id}`)} onClick={(event) => event.stopPropagation()}>
                            {shortId(booking.id)}
                          </a>
                        </td>
                        <td>
                          {booking.vehicle.brand} {booking.vehicle.model}
                        </td>
                        <td>{fullName(booking.driver)}</td>
                        <td>{fullName(booking.owner)}</td>
                        <td>{formatDateTime(booking.startDatetime)}</td>
                        <td>{formatMoney(booking.totalPrice)}</td>
                        <td>
                          <Badge tone={bookingTone(booking.status)}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onChange={(next) => setParams({ page: String(next) })} />
            </>
          )}
        </AsyncContent>
      </Card>
    </>
  );
}
