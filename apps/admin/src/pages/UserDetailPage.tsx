import { useState } from 'react';
import { AsyncContent, Card, ConfirmDialog, DefinitionList, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, fullName } from '../lib/format';
import { href } from '../lib/router';
import type { AdminUserDetail, SignedFile } from '../lib/types';
import { useApi } from '../lib/useApi';
import { UserStatusBadges } from './UsersPage';

type Action = 'verify' | 'unverify' | 'block' | 'unblock';

function DocumentPreview({ label, file, uploaded }: { label: string; file: SignedFile; uploaded: boolean }) {
  return (
    <figure className="document">
      <figcaption>{label}</figcaption>
      {file.url ? (
        <a href={file.url} target="_blank" rel="noreferrer noopener">
          <img src={file.url} alt={label} />
        </a>
      ) : (
        <div className="document__empty">{uploaded ? 'No se pudo generar el enlace' : 'No subido'}</div>
      )}
      {file.expiresAt ? <span className="muted small">Enlace temporal hasta {formatDateTime(file.expiresAt)}</span> : null}
    </figure>
  );
}

export function UserDetailPage({ id, currentAdminId }: { id: string; currentAdminId: string }) {
  const { data, loading, error, reload, setData } = useApi(() => api.get<AdminUserDetail>(`/admin/users/${id}`), [id]);
  const [action, setAction] = useState<Action | null>(null);

  const run = async (reason: string) => {
    if (action === 'verify' || action === 'unverify') {
      setData(await api.put<AdminUserDetail>(`/admin/users/${id}/verification`, { isVerified: action === 'verify' }));
    } else if (action) {
      setData(
        await api.put<AdminUserDetail>(`/admin/users/${id}/block`, {
          blocked: action === 'block',
          ...(action === 'block' && reason ? { reason } : {})
        })
      );
    }
  };

  return (
    <>
      <a className="back-link" href={href('/users')}>
        ← Usuarios
      </a>
      <AsyncContent data={data} loading={loading} error={error} onRetry={reload}>
        {(user) => (
          <>
            <PageHeader
              title={fullName(user)}
              subtitle={user.email ?? undefined}
              actions={
                <>
                  {user.isVerified ? (
                    <button className="btn btn--secondary" onClick={() => setAction('unverify')}>
                      Retirar verificación
                    </button>
                  ) : (
                    <button className="btn btn--primary" onClick={() => setAction('verify')} disabled={!user.hasIdDocument || !user.hasDriverLicense}>
                      Verificar documentos
                    </button>
                  )}
                  {user.blockedAt ? (
                    <button className="btn btn--secondary" onClick={() => setAction('unblock')}>
                      Desbloquear
                    </button>
                  ) : (
                    <button className="btn btn--danger" onClick={() => setAction('block')} disabled={user.id === currentAdminId}>
                      Bloquear
                    </button>
                  )}
                </>
              }
            />
            <div className="stack">
              <UserStatusBadges user={user} />
              {user.blockedAt ? (
                <div className="notice notice--danger">
                  Bloqueado el {formatDateTime(user.blockedAt)}
                  {user.blockedReason ? `: ${user.blockedReason}` : ''}
                </div>
              ) : null}
              <div className="grid-2">
                <Card title="Datos">
                  <DefinitionList
                    items={[
                      ['Id', <span className="mono">{user.id}</span>],
                      ['Teléfono', user.phoneNumber ?? '—'],
                      ['Alta', formatDateTime(user.createdAt)],
                      ['Cuenta de cobros Stripe', user.hasStripeAccount ? 'Vinculada' : 'No vinculada']
                    ]}
                  />
                </Card>
                <Card title="Actividad">
                  <DefinitionList
                    items={[
                      ['Vehículos publicados', user.stats.vehicles],
                      ['Reservas como conductor', user.stats.bookingsAsDriver],
                      ['Reservas como propietario', user.stats.bookingsAsOwner],
                      [
                        'Valoración media',
                        user.stats.averageRating === null
                          ? 'Sin reseñas'
                          : `${user.stats.averageRating.toFixed(1)} / 5 (${user.stats.reviewsReceived})`
                      ],
                      ['Incidencias', user.stats.incidents]
                    ]}
                  />
                </Card>
              </div>
              <Card title="Documentación">
                <p className="muted small">
                  Los documentos se sirven con URLs firmadas de caducidad corta. No las compartas fuera del backoffice.
                </p>
                <div className="documents">
                  <DocumentPreview label="DNI / documento de identidad" file={user.documents.idDocument} uploaded={user.hasIdDocument} />
                  <DocumentPreview label="Carnet de conducir" file={user.documents.driverLicense} uploaded={user.hasDriverLicense} />
                </div>
              </Card>
            </div>
            {action ? (
              <ConfirmDialog
                title={
                  {
                    verify: 'Verificar documentación',
                    unverify: 'Retirar verificación',
                    block: 'Bloquear cuenta',
                    unblock: 'Desbloquear cuenta'
                  }[action]
                }
                description={
                  {
                    verify: 'El usuario podrá solicitar y gestionar reservas.',
                    unverify: 'El usuario no podrá hacer operaciones transaccionales hasta volver a ser verificado.',
                    block: 'El usuario perderá el acceso a la app y a la API inmediatamente (como mucho 30 segundos).',
                    unblock: 'El usuario recuperará el acceso a la app.'
                  }[action]
                }
                confirmLabel={{ verify: 'Verificar', unverify: 'Retirar', block: 'Bloquear', unblock: 'Desbloquear' }[action]}
                danger={action === 'block' || action === 'unverify'}
                reasonLabel={action === 'block' ? 'Motivo (opcional, visible solo para administración)' : undefined}
                onConfirm={run}
                onClose={() => setAction(null)}
              />
            ) : null}
          </>
        )}
      </AsyncContent>
    </>
  );
}
