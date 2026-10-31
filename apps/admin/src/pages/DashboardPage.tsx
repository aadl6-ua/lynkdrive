import { AsyncContent, Badge, Card, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { BOOKING_STATUS_LABELS, bookingTone, formatMoney, formatMonth } from '../lib/format';
import { href } from '../lib/router';
import type { BookingStatus, Dashboard } from '../lib/types';
import { useApi } from '../lib/useApi';

const STATUS_ORDER = Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[];

function Kpi({ label, value, hint, link }: { label: string; value: string | number; hint?: string; link?: string }) {
  const body = (
    <>
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value">{value}</strong>
      {hint ? <span className="kpi__hint">{hint}</span> : null}
    </>
  );

  return link ? (
    <a className="kpi kpi--link" href={link}>
      {body}
    </a>
  ) : (
    <div className="kpi">{body}</div>
  );
}

export function DashboardPage() {
  const { data, loading, error, reload } = useApi(() => api.get<Dashboard>('/admin/dashboard'), []);

  return (
    <>
      <PageHeader title="Resumen" subtitle="Estado general de la plataforma" />
      <AsyncContent data={data} loading={loading} error={error} onRetry={reload}>
        {(dashboard) => {
          const maxMonthly = Math.max(1, ...dashboard.revenue.monthly.map((month) => month.gross));
          const maxStatus = Math.max(1, ...Object.values(dashboard.bookings.byStatus).map(Number));

          return (
            <div className="stack">
              <div className="kpi-grid">
                <Kpi label="Usuarios" value={dashboard.users.total} hint={`+${dashboard.users.newLast30Days} en 30 días`} link={href('/users')} />
                <Kpi
                  label="Pendientes de verificar"
                  value={dashboard.users.pendingVerification}
                  hint="Con DNI y carnet subidos"
                  link={href('/users?filter=pending_verification')}
                />
                <Kpi label="Vehículos activos" value={dashboard.vehicles.active} hint={`${dashboard.vehicles.total} publicados`} link={href('/vehicles')} />
                <Kpi label="Reservas" value={dashboard.bookings.total} hint={`${dashboard.revenue.paidBookings} cobradas`} link={href('/bookings')} />
                <Kpi label="Volumen cobrado" value={formatMoney(dashboard.revenue.gross)} hint={`${formatMoney(dashboard.revenue.grossLast30Days)} en 30 días`} />
                <Kpi
                  label="Comisión estimada"
                  value={formatMoney(dashboard.revenue.estimatedPlatformFees)}
                  hint={`${dashboard.revenue.platformFeePercent} % del volumen`}
                />
                <Kpi label="Incidencias abiertas" value={dashboard.moderation.openIncidents} link={href('/incidents')} />
                <Kpi label="Usuarios bloqueados" value={dashboard.users.blocked} hint={`${dashboard.moderation.hiddenReviews} reseñas ocultas`} />
              </div>

              <div className="grid-2">
                <Card title="Volumen cobrado por mes">
                  <div className="bar-chart" role="img" aria-label="Volumen cobrado en los últimos seis meses">
                    {dashboard.revenue.monthly.map((month) => (
                      <div key={month.month} className="bar-chart__column" title={`${formatMoney(month.gross)} · ${month.bookings} reservas`}>
                        <span className="bar-chart__value">{month.gross > 0 ? formatMoney(month.gross) : ''}</span>
                        <div className="bar-chart__bar" style={{ height: `${(month.gross / maxMonthly) * 100}%` }} />
                        <span className="bar-chart__label">{formatMonth(month.month)}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title="Reservas por estado">
                  <ul className="status-bars">
                    {STATUS_ORDER.map((status) => {
                      const count = dashboard.bookings.byStatus[status] ?? 0;
                      return (
                        <li key={status}>
                          <a href={href(`/bookings?status=${status}`)}>
                            <Badge tone={bookingTone(status)}>{BOOKING_STATUS_LABELS[status]}</Badge>
                          </a>
                          <div className="status-bars__track">
                            <div className="status-bars__fill" style={{ width: `${(count / maxStatus) * 100}%` }} />
                          </div>
                          <strong>{count}</strong>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>
            </div>
          );
        }}
      </AsyncContent>
    </>
  );
}
