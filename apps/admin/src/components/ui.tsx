import { ReactNode, useEffect, useState } from 'react';
import { Tone, totalPages } from '../lib/format';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {title || actions ? (
        <div className="card__header">
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <strong>No se pudo cargar</strong>
      <span>{message}</span>
      {onRetry ? (
        <button className="btn btn--secondary" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {description ? <span className="muted">{description}</span> : null}
    </div>
  );
}

/** Envuelve el patrón carga / error / vacío / contenido de cada vista. */
export function AsyncContent<T>({
  data,
  loading,
  error,
  onRetry,
  isEmpty,
  empty,
  children
}: {
  data: T | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !data) return <Loading />;
  if (!data) return null;
  if (isEmpty?.(data)) return <>{empty ?? <EmptyState title="Sin resultados" />}</>;
  return <>{children(data)}</>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = totalPages(total, pageSize);

  return (
    <div className="pagination">
      <span className="muted">
        {total} resultado{total === 1 ? '' : 's'} · página {page} de {pages}
      </span>
      <div className="pagination__buttons">
        <button className="btn btn--ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </button>
        <button className="btn btn--ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}

/** Input de búsqueda con debounce para no lanzar una petición por tecla. */
export function SearchInput({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft !== value) onChange(draft);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <input
      className="input"
      type="search"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      aria-label={placeholder}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <select className="input input--select" value={value} onChange={(event) => onChange(event.target.value as T)} aria-label={label}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Diálogo de confirmación para acciones sensibles. Con `reasonLabel` pide además un
 * motivo opcional (bloqueos, moderación).
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  reasonLabel,
  onConfirm,
  onClose
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="modal-title">{title}</h2>
        <p className="muted">{description}</p>
        {reasonLabel ? (
          <label className="field">
            <span>{reasonLabel}</span>
            <textarea className="input" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={submit} disabled={busy}>
            {busy ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DefinitionList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="definition-list">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
