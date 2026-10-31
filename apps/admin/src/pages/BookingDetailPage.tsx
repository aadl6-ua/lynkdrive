import { AsyncContent, Badge, Card, DefinitionList, EmptyState, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import {
  BOOKING_STATUS_LABELS,
  bookingTone,
  formatDateTime,
  formatMoney,
  fullName,
  INCIDENT_STATUS_LABELS,
  incidentTone,
  PAYOUT_STATUS_LABELS,
  shortId
} from '../lib/format';
import { href } from '../lib/router';
import type { AdminBookingDetail } from '../lib/types';
import { useApi } from '../lib/useApi';

const CHECKLIST_LABELS = { check_in: 'Check-in (entrega)', check_out: 'Check-out (devolución)' };

export function BookingDetailPage({ id }: { id: string }) {
  const { data, loading, error, reload } = useApi(() => api.get<AdminBookingDetail>(`/admin/bookings/${id}`), [id]);

  return (
    <>
      <a className="back-link" href={href('/bookings')}>
        ← Reservas
      </a>
      <AsyncContent data={data} loading={loading} error={error} onRetry={reload}>
        {(booking) => (
          <>
            <PageHeader
              title={`Reserva ${shortId(booking.id)}`}
              subtitle={`${booking.vehicle.brand} ${booking.vehicle.model} · ${booking.vehicle.licensePlate}`}
              actions={
                <a className="btn btn--secondary" href={href(`/incidents?new=1&bookingId=${booking.id}`)}>
                  Abrir incidencia
                </a>
              }
            />
            <div className="stack">
              <div className="grid-2">
                <Card title="Resumen">
                  <DefinitionList
                    items={[
                      ['Estado', <Badge tone={bookingTone(booking.status)}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>],
                      ['Conductor', <a href={href(`/users/${booking.driver.id}`)}>{fullName(booking.driver)}</a>],
                      ['Propietario', <a href={href(`/users/${booking.owner.id}`)}>{fullName(booking.owner)}</a>],
                      ['Inicio', formatDateTime(booking.startDatetime)],
                      ['Fin', formatDateTime(booking.endDatetime)],
                      ['Precio/día', formatMoney(booking.pricePerDayAtBooking)],
                      ['Total', formatMoney(booking.totalPrice)],
                      ['PaymentIntent', booking.paymentIntentId ? <span className="mono">{booking.paymentIntentId}</span> : '—'],
                      ['Pago al propietario', PAYOUT_STATUS_LABELS[booking.payoutStatus] ?? booking.payoutStatus],
                      ['Reseñas', booking.reviewIds.length]
                    ]}
                  />
                </Card>
                <Card title="Historial de estados">
                  {booking.history.length === 0 ? (
                    <EmptyState title="Sin historial" />
                  ) : (
                    <ol className="timeline">
                      {booking.history.map((entry, index) => (
                        <li key={`${entry.toStatus}-${index}`}>
                          <Badge tone={bookingTone(entry.toStatus)}>{BOOKING_STATUS_LABELS[entry.toStatus]}</Badge>
                          <span className="muted small">{formatDateTime(entry.changedAt)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              </div>

              <Card title="Checklists y evidencias">
                {booking.checklists.length === 0 ? (
                  <EmptyState title="Sin checklists" description="Se registran en la entrega y la devolución del vehículo." />
                ) : (
                  <div className="stack">
                    {booking.checklists.map((checklist) => (
                      <div key={checklist.id} className="checklist">
                        <h3>{CHECKLIST_LABELS[checklist.type]}</h3>
                        <DefinitionList
                          items={[
                            ['Enviado por', fullName(checklist.submittedBy)],
                            ['Fecha', formatDateTime(checklist.createdAt)],
                            ['Kilometraje', `${checklist.mileage.toLocaleString('es-ES')} km`],
                            ['Combustible', `${checklist.fuelLevel} %`],
                            ['Notas', checklist.notes ?? '—']
                          ]}
                        />
                        {checklist.images.length === 0 ? (
                          <p className="muted small">Sin fotos de evidencia.</p>
                        ) : (
                          <div className="gallery">
                            {checklist.images.map((image) =>
                              image.file.url ? (
                                <a key={image.id} href={image.file.url} target="_blank" rel="noreferrer noopener">
                                  <img src={image.file.url} alt="Evidencia del checklist" loading="lazy" />
                                </a>
                              ) : (
                                <div key={image.id} className="gallery__missing">
                                  Enlace no disponible
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <p className="muted small">Las fotos usan URLs firmadas temporales: recarga la página si han caducado.</p>
                  </div>
                )}
              </Card>

              <Card title="Mensajes entre las partes">
                {booking.messages.length === 0 ? (
                  <EmptyState title="Sin mensajes" description="El conductor y el propietario no han usado el chat de esta reserva." />
                ) : (
                  <div className="stack">
                    <p className="muted small">Solo lectura. Consúltalos únicamente para gestionar incidencias de esta reserva.</p>
                    <ol className="chat-log">
                      {booking.messages.map((message) => {
                        const fromOwner = message.sender.id === booking.owner.id;
                        return (
                          <li key={message.id} className={fromOwner ? 'chat-log__item chat-log__item--owner' : 'chat-log__item'}>
                            <div className="chat-log__meta">
                              <strong>{fullName(message.sender)}</strong>
                              <span className="muted small">
                                {fromOwner ? 'Propietario' : 'Conductor'} · {formatDateTime(message.createdAt)}
                                {message.readAt ? ' · leído' : ''}
                              </span>
                            </div>
                            <p className="chat-log__body">{message.body}</p>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </Card>

              <Card title="Incidencias">
                {booking.incidents.length === 0 ? (
                  <EmptyState title="Sin incidencias" />
                ) : (
                  <ul className="link-list">
                    {booking.incidents.map((incident) => (
                      <li key={incident.id}>
                        <a href={href(`/incidents/${incident.id}`)}>{incident.title}</a>
                        <Badge tone={incidentTone(incident.status)}>{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
                        <span className="muted small">{formatDateTime(incident.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </AsyncContent>
    </>
  );
}
