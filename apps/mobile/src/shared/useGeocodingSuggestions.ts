import { useEffect, useState } from 'react';
import { GeocodingSuggestion, searchGeocodingSuggestions } from '../api/geocoding';

type UseGeocodingSuggestionsResult = {
  suggestions: GeocodingSuggestion[];
  loading: boolean;
  error: string | null;
};

export function useGeocodingSuggestions(query: string): UseGeocodingSuggestionsResult {
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 3) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    const timeoutId = setTimeout(() => {
      const loadSuggestions = async () => {
        setLoading(true);
        setError(null);

        try {
          const data = await searchGeocodingSuggestions(trimmed);

          if (!isCancelled) {
            setSuggestions(data);
          }
        } catch {
          if (!isCancelled) {
            setSuggestions([]);
            setError('No se pudieron cargar sugerencias de direccion.');
          }
        } finally {
          if (!isCancelled) {
            setLoading(false);
          }
        }
      };

      void loadSuggestions();
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query]);

  return {
    suggestions,
    loading,
    error
  };
}
