import { AsyncContent, Badge, Card, PageHeader, Pagination, SearchInput, Select } from '../components/ui';
import { api, buildQuery } from '../lib/api';
import { formatDate, fullName } from '../lib/format';
import { href, navigate, useQueryParams } from '../lib/router';
import type { AdminUser, Paginated } from '../lib/types';
import { useApi } from '../lib/useApi';

type Filter = 'all' | 'pending_verification' | 'verified' | 'blocked' | 'admins';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending_verification', label: 'Pendientes de verificar' },
  { value: 'verified', label: 'Verificados' },
  { value: 'blocked', label: 'Bloqueados' },
  { value: 'admins', label: 'Administradores' }
];

export function UserStatusBadges({ user }: { user: AdminUser }) {
  return (
    <span className="badges">
      {user.blockedAt ? <Badge tone="danger">Bloqueado</Badge> : null}
      {user.isVerified ? (
        <Badge tone="success">Verificado</Badge>
      ) : user.hasIdDocument && user.hasDriverLicense ? (
        <Badge tone="warning">Por verificar</Badge>
      ) : (
        <Badge>Sin documentos</Badge>
      )}
      {user.isAdmin ? <Badge tone="info">Admin</Badge> : null}
    </span>
  );
}

export function UsersPage() {
  const [params, setParams] = useQueryParams({ page: '1', search: '', filter: 'all' });
  const page = Number(params.page) || 1;
  const { data, loading, error, reload } = useApi(
    () =>
      api.get<Paginated<AdminUser>>(
        `/admin/users${buildQuery({ page, pageSize: 20, search: params.search, filter: params.filter })}`
      ),
    [page, params.search, params.filter]
  );

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Verificación de documentos y bloqueo de cuentas" />
      <Card>
        <div className="toolbar">
          <SearchInput value={params.search} onChange={(search) => setParams({ search })} placeholder="Buscar por nombre, email, teléfono o id" />
          <Select label="Filtro" value={params.filter as Filter} onChange={(filter) => setParams({ filter })} options={FILTERS} />
        </div>
        <AsyncContent data={data} loading={loading} error={error} onRetry={reload} isEmpty={(result) => result.items.length === 0}>
          {(result) => (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                      <th>Alta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((user) => (
                      <tr key={user.id} className="table__row--link" onClick={() => navigate(`/users/${user.id}`)}>
                        <td>
                          <a href={href(`/users/${user.id}`)} onClick={(event) => event.stopPropagation()}>
                            {fullName(user)}
                          </a>
                        </td>
                        <td>{user.email ?? '—'}</td>
                        <td>{user.phoneNumber ?? '—'}</td>
                        <td>
                          <UserStatusBadges user={user} />
                        </td>
                        <td>{formatDate(user.createdAt)}</td>
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
