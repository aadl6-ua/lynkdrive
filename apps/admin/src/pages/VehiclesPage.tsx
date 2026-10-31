import { useState } from 'react';
import { AsyncContent, Badge, Card, ConfirmDialog, PageHeader, Pagination, SearchInput, Select } from '../components/ui';
import { api, buildQuery } from '../lib/api';
import { formatMoney, fullName } from '../lib/format';
import { href, useQueryParams } from '../lib/router';
import type { AdminVehicle, Paginated } from '../lib/types';
import { useApi } from '../lib/useApi';

type StatusFilter = '' | 'active' | 'inactive';

export function VehiclesPage() {
  const [params, setParams] = useQueryParams({ page: '1', search: '', status: '' });
  const page = Number(params.page) || 1;
  const [pending, setPending] = useState<AdminVehicle | null>(null);
  const { data, loading, error, reload } = useApi(
    () =>
      api.get<Paginated<AdminVehicle>>(
        `/admin/vehicles${buildQuery({ page, pageSize: 20, search: params.search, status: params.status })}`
      ),
    [page, params.search, params.status]
  );

  const toggle = async (vehicle: AdminVehicle) => {
    await api.put(`/admin/vehicles/${vehicle.id}/status`, { status: vehicle.status === 'active' ? 'inactive' : 'active' });
    reload();
  };

  return (
    <>
      <PageHeader title="Vehículos" subtitle="Activa o retira anuncios de la búsqueda" />
      <Card>
        <div className="toolbar">
          <SearchInput value={params.search} onChange={(search) => setParams({ search })} placeholder="Buscar por marca, modelo, matrícula o dirección" />
          <Select<StatusFilter>
            label="Estado"
            value={params.status as StatusFilter}
            onChange={(status) => setParams({ status })}
            options={[
              { value: '', label: 'Todos' },
              { value: 'active', label: 'Activos' },
              { value: 'inactive', label: 'Inactivos' }
            ]}
          />
        </div>
        <AsyncContent data={data} loading={loading} error={error} onRetry={reload} isEmpty={(result) => result.items.length === 0}>
          {(result) => (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Vehículo</th>
                      <th scope="col">Matrícula</th>
                      <th scope="col">Propietario</th>
                      <th scope="col">Precio/día</th>
                      <th scope="col">Reservas</th>
                      <th scope="col">Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((vehicle) => (
                      <tr key={vehicle.id}>
                        <td>
                          <div className="vehicle-cell">
                            {vehicle.primaryImageUrl ? (
                              <img src={vehicle.primaryImageUrl} alt="" loading="lazy" />
                            ) : (
                              <span className="vehicle-cell__placeholder" aria-hidden />
                            )}
                            <div>
                              <strong>
                                {vehicle.brand} {vehicle.model}
                              </strong>
                              <span className="muted">
                                {vehicle.year} · {vehicle.locationAddress}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{vehicle.licensePlate}</td>
                        <td>
                          <a href={href(`/users/${vehicle.owner.id}`)}>{fullName(vehicle.owner)}</a>
                        </td>
                        <td>{formatMoney(vehicle.pricePerDay)}</td>
                        <td>{vehicle.bookings}</td>
                        <td>
                          {vehicle.disabledByAdmin ? (
                            <Badge tone="danger">Retirado por admin</Badge>
                          ) : (
                            <Badge tone={vehicle.status === 'active' ? 'success' : 'neutral'}>
                              {vehicle.status === 'active' ? 'Activo' : 'Inactivo'}
                            </Badge>
                          )}
                        </td>
                        <td className="table__actions">
                          <button className={`btn btn--small ${vehicle.status === 'active' ? 'btn--secondary' : 'btn--primary'}`} onClick={() => setPending(vehicle)}>
                            {vehicle.status === 'active' ? 'Desactivar' : 'Activar'}
                          </button>
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
      {pending ? (
        <ConfirmDialog
          title={pending.status === 'active' ? 'Desactivar vehículo' : 'Activar vehículo'}
          description={
            pending.status === 'active'
              ? `${pending.brand} ${pending.model} (${pending.licensePlate}) dejará de aparecer en la búsqueda y el propietario no podrá reactivarlo. Las reservas existentes no se modifican.`
              : `${pending.brand} ${pending.model} (${pending.licensePlate}) volverá a aparecer en la búsqueda.`
          }
          confirmLabel={pending.status === 'active' ? 'Desactivar' : 'Activar'}
          danger={pending.status === 'active'}
          onConfirm={() => toggle(pending)}
          onClose={() => setPending(null)}
        />
      ) : null}
    </>
  );
}
