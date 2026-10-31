import { FormEvent, useState } from 'react';
import { AsyncContent, Badge, Card, DefinitionList, PageHeader, Select } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, fullName, INCIDENT_STATUS_LABELS, incidentTone, shortId } from '../lib/format';
import { href } from '../lib/router';
import type { AdminIncidentDetail, IncidentStatus } from '../lib/types';
import { useApi } from '../lib/useApi';
import { INCIDENT_STATUS_OPTIONS } from './IncidentsPage';

export function IncidentDetailPage({ id }: { id: string }) {
  const { data, loading, error, reload, setData } = useApi(() => api.get<AdminIncidentDetail>(`/admin/incidents/${id}`), [id]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const perform = async (action: () => Promise<AdminIncidentDetail>) => {
    setBusy(true);
    setActionError(null);
    try {
      setData(await action());
      return true;
    } catch (caught) {
      setActionError((caught as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (status: IncidentStatus) =>
    perform(() => api.put<AdminIncidentDetail>(`/admin/incidents/${id}/status`, { status }));

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    if (await perform(() => api.post<AdminIncidentDetail>(`/admin/incidents/${id}/notes`, { body: note }))) setNote('');
  };

  return (
    <>
      <a className="back-link" href={href('/incidents')}>
        ← Incidencias
      </a>
      <AsyncContent data={data} loading={loading} error={error} onRetry={reload}>
        {(incident) => (
          <>
            <PageHeader
              title={incident.title}
              subtitle={`Abierta el ${formatDateTime(incident.createdAt)}`}
              actions={
                <Select<IncidentStatus>
                  label="Cambiar estado"
                  value={incident.status}
                  onChange={(status) => void changeStatus(status)}
                  options={INCIDENT_STATUS_OPTIONS}
                />
              }
            />
            <div className="stack">
              {actionError ? <p className="form-error">{actionError}</p> : null}
              <div className="grid-2">
                <Card title="Detalle">
                  <p className="pre-line">{incident.description}</p>
                </Card>
                <Card title="Relacionado con">
                  <DefinitionList
                    items={[
                      ['Estado', <Badge tone={incidentTone(incident.status)}>{INCIDENT_STATUS_LABELS[incident.status]}</Badge>],
                      ['Reserva', incident.bookingId ? <a href={href(`/bookings/${incident.bookingId}`)}>{shortId(incident.bookingId)}</a> : '—'],
                      ['Usuario', incident.userId ? <a href={href(`/users/${incident.userId}`)}>{shortId(incident.userId)}</a> : '—'],
                      ['Vehículo', incident.vehicleId ? <span className="mono">{shortId(incident.vehicleId)}</span> : '—'],
                      ['Última actualización', formatDateTime(incident.updatedAt)]
                    ]}
                  />
                </Card>
              </div>
              <Card title={`Notas internas (${incident.notes.length})`}>
                {incident.notes.length > 0 ? (
                  <ol className="notes">
                    {incident.notes.map((entry) => (
                      <li key={entry.id}>
                        <div className="muted small">
                          {entry.author ? fullName(entry.author) : 'Admin eliminado'} · {formatDateTime(entry.createdAt)}
                        </div>
                        <p className="pre-line">{entry.body}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">Todavía no hay notas.</p>
                )}
                <form className="form" onSubmit={addNote}>
                  <label className="field">
                    <span>Añadir nota</span>
                    <textarea className="input" rows={3} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} />
                  </label>
                  <div className="form__actions">
                    <button className="btn btn--primary" type="submit" disabled={busy || !note.trim()}>
                      Guardar nota
                    </button>
                  </div>
                </form>
              </Card>
            </div>
          </>
        )}
      </AsyncContent>
    </>
  );
}
