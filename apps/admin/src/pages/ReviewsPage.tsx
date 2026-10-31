import { useState } from 'react';
import { AsyncContent, Badge, Card, ConfirmDialog, PageHeader, Pagination, Select } from '../components/ui';
import { api, buildQuery } from '../lib/api';
import { formatDate, fullName } from '../lib/format';
import { href, useQueryParams } from '../lib/router';
import type { AdminReview, Paginated } from '../lib/types';
import { useApi } from '../lib/useApi';

type Visibility = 'all' | 'visible' | 'hidden';

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`${rating} de 5`}>
      {'★'.repeat(rating)}
      <span className="stars__off">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export function ReviewsPage() {
  const [params, setParams] = useQueryParams({ page: '1', visibility: 'all', maxRating: '' });
  const page = Number(params.page) || 1;
  const [pending, setPending] = useState<AdminReview | null>(null);
  const { data, loading, error, reload } = useApi(
    () =>
      api.get<Paginated<AdminReview>>(
        `/admin/reviews${buildQuery({ page, pageSize: 20, visibility: params.visibility, maxRating: params.maxRating })}`
      ),
    [page, params.visibility, params.maxRating]
  );

  const toggle = async (review: AdminReview, reason: string) => {
    await api.put(`/admin/reviews/${review.id}/visibility`, {
      hidden: !review.hiddenAt,
      ...(!review.hiddenAt && reason ? { reason } : {})
    });
    reload();
  };

  return (
    <>
      <PageHeader title="Reseñas" subtitle="Las reseñas ocultas no se muestran en la app ni cuentan en la valoración media" />
      <Card>
        <div className="toolbar">
          <Select<Visibility>
            label="Visibilidad"
            value={params.visibility as Visibility}
            onChange={(visibility) => setParams({ visibility })}
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'visible', label: 'Visibles' },
              { value: 'hidden', label: 'Ocultas' }
            ]}
          />
          <Select
            label="Valoración"
            value={params.maxRating}
            onChange={(maxRating) => setParams({ maxRating })}
            options={[
              { value: '', label: 'Cualquier valoración' },
              { value: '2', label: '2 estrellas o menos' },
              { value: '1', label: '1 estrella' }
            ]}
          />
        </div>
        <AsyncContent data={data} loading={loading} error={error} onRetry={reload} isEmpty={(result) => result.items.length === 0}>
          {(result) => (
            <>
              <ul className="review-list">
                {result.items.map((review) => (
                  <li key={review.id} className={review.hiddenAt ? 'review review--hidden' : 'review'}>
                    <div className="review__header">
                      <Stars rating={review.rating} />
                      <span className="muted small">
                        <a href={href(`/users/${review.reviewer.id}`)}>{fullName(review.reviewer)}</a> sobre{' '}
                        <a href={href(`/users/${review.reviewee.id}`)}>{fullName(review.reviewee)}</a> · {formatDate(review.createdAt)} ·{' '}
                        <a href={href(`/bookings/${review.bookingId}`)}>ver reserva</a>
                      </span>
                      {review.hiddenAt ? <Badge tone="warning">Oculta</Badge> : null}
                    </div>
                    <p>{review.comment ?? <span className="muted">Sin comentario</span>}</p>
                    {review.hiddenReason ? <p className="muted small">Motivo: {review.hiddenReason}</p> : null}
                    <button className={`btn btn--small ${review.hiddenAt ? 'btn--secondary' : 'btn--danger'}`} onClick={() => setPending(review)}>
                      {review.hiddenAt ? 'Volver a mostrar' : 'Ocultar'}
                    </button>
                  </li>
                ))}
              </ul>
              <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onChange={(next) => setParams({ page: String(next) })} />
            </>
          )}
        </AsyncContent>
      </Card>
      {pending ? (
        <ConfirmDialog
          title={pending.hiddenAt ? 'Volver a mostrar reseña' : 'Ocultar reseña'}
          description={
            pending.hiddenAt
              ? 'La reseña volverá a ser visible y a contar en la valoración media.'
              : 'La reseña dejará de mostrarse y de contar en la valoración media. No se borra.'
          }
          confirmLabel={pending.hiddenAt ? 'Mostrar' : 'Ocultar'}
          danger={!pending.hiddenAt}
          reasonLabel={pending.hiddenAt ? undefined : 'Motivo de moderación (opcional)'}
          onConfirm={(reason) => toggle(pending, reason)}
          onClose={() => setPending(null)}
        />
      ) : null}
    </>
  );
}
