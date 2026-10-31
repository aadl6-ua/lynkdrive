import { useCallback, useEffect, useState } from 'react';

type State<T> = { data: T | null; error: string | null; loading: boolean };

/** Carga datos de la API y expone estado de carga/error y una función de recarga. */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    load()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error: Error) => !cancelled && setState({ data: null, error: error.message, loading: false }));

    return () => {
      cancelled = true;
    };
  }, [load, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), []);

  return { ...state, reload, setData };
}
