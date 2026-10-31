import { useCallback, useEffect, useState } from 'react';

// Router mínimo basado en hash (#/users/123?page=2): sin dependencias y compatible con
// cualquier hosting estático sin reglas de reescritura.

function readHash(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function splitHash(hash: string): { path: string; query: URLSearchParams } {
  const [path, query = ''] = hash.split('?');
  return { path: path || '/', query: new URLSearchParams(query) };
}

export function useHash(): string {
  const [hash, setHash] = useState(readHash);

  useEffect(() => {
    const onChange = () => setHash(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return hash;
}

export function useHashPath(): string {
  return splitHash(useHash()).path;
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}

/**
 * Estado de filtros/paginación guardado en la query del hash, para que los listados
 * se puedan compartir por enlace y el botón atrás funcione.
 */
export function useQueryParams<T extends Record<string, string>>(defaults: T) {
  const { path, query } = splitHash(useHash());
  const values = { ...defaults };

  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = query.get(key as string);
    if (value !== null) values[key] = value as T[keyof T];
  }

  const update = useCallback(
    (changes: Partial<T>) => {
      const next = new URLSearchParams(splitHash(readHash()).query);

      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === '' || value === defaults[key]) next.delete(key);
        else next.set(key, String(value));
      }

      // Cualquier cambio de filtro vuelve a la primera página.
      if (!('page' in changes)) next.delete('page');

      const search = next.toString();
      navigate(search ? `${path}?${search}` : path);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path]
  );

  return [values, update] as const;
}
