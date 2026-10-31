import { FormEvent, useState } from 'react';
import { AsyncContent, Badge, Card, PageHeader, Pagination, Select } from '../components/ui';
import { api, buildQuery } from '../lib/api';
import { formatDateTime, INCIDENT_STATUS_LABELS, incidentTone, shortId } from '../lib/format';
import { href, navigate, useQueryParams } from '../lib/router';
import type { AdminIncident, AdminIncidentDetail, IncidentStatus, Paginated } from '../lib/types';
import { useApi } from '../lib/useApi';

const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

export const INCIDENT_STATUS_OPTIONS = (Object.entries(INCIDENT_STATUS_LABELS) as Array<[IncidentStatus, string]>).map(
  ([value, label]) => ({ value, label })
);

function NewIncidentForm({ bookingId, onCancel }: { bookingId: string; onCancel: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', bookingId, userId: '', vehicleId: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim() !== ''));
      const created = await api.post<AdminIncidentDetail>('/admin/incidents', payload);
      navigate(`/incidents/${created.id}`);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card title="Nueva incidencia">
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Título</span>
          <input className="input" required maxLength={200} value={form.title} onChange={set('title')} />
        </label>
        <label className="field">
          <span>Descripción</span>
          <textarea className="input" required rows={4} maxLength={5000} value={form.description} onChange={set('description')} />
        </label>
        <div className="grid-3">
          <label className="field">
            <span>Reserva (id, opcional)</span>
            <input className="input mono" pattern={UUID_PATTERN} value={form.bookingId} onChange={set('bookingId')} />
          </label>
          <label className="field">
            <span>Usuario (id, opcional)</span>
            <input className="input mono" pattern={UUID_PATTERN} value={form.userId} onChange={set('userId')} />
          </label>
          <label className="field">
            <span>Vehículo (id, opcional)</span>
            <input className="input mono" pattern={UUID_PATTERN} value={form.vehicleId} onChange={set('vehicleId')} />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="form__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Creando…' : 'Crear incidencia'}
          </button>
        </div>
      </form>
    </Card>
  );
}

export function IncidentsPage() {
  const [params, setParams] = useQueryParams({ page: '1', status: '', new: '', bookingId: '' });
  const page = Number(params.page) || 1;
  const { data, loading, error, reload } = useApi(
    () => api.get<Paginated<AdminIncident>>(`/admin/incidents${buildQuery({ page, pageSize: 20, status: params.status })}`),
    [page, params.status]
  );

  return (
    <>
      <PageHeader
        title="Incidencias"
        subtitle="Seguimiento de daños, disputas y otros problemas"
        actions={
          params.new ? null : (
            <button className="btn btn--primary" onClick={() => setParams({ new: '1' })}>
              Nueva incidencia
            </button>
          )
        }
      />
      <div className="stack">
        {params.new ? <NewIncidentForm bookingId={params.bookingId} onCancel={() => setParams({ new: '', bookingId: '' })} /> : null}
        <Card>
          <div className="toolbar">
            <Select<IncidentStatus | ''>
              label="Estado"
              value={params.status as IncidentStatus | ''}
              onChange={(status) => setParams({ status })}
              options={[{ value: '', label: 'Todos los estados' }, ...INCIDENT_STATUS_OPTIONS]}
            />
          </div>
          <AsyncContent data={data} loading={loading} error={error} onRetry={reload} isEmpty={(result) => result.items.length === 0}>
            {(result) => (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Título</th>
                        <th>Reserva</th>
                        <th>Notas</th>
                        <th>Actualizada</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((incident) => (
                        <tr key={incident.id} className="table__row--link" onClick={() => navigate(`/incidents/${incident.id}`)}>
                          <td>
                            <a href={href(`/incidents/${incident.id}`)} onClick={(event) => event.stopPropagation()}>
                              {incident.title}
                            </a>
                          </td>
                          <td className="mono">{incident.bookingId ? shortId(incident.bookingId) : '—'}</td>
                          <td>{incident.notesCount}</td>
                          <td>{formatDateTime(incident.updatedAt)}</td>
                          <td>
                            <Badge tone={incidentTone(incident.status)}>{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
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
      </div>
    </>
  );
}
