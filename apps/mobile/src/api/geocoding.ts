import { httpClient } from './http';

export type GeocodingSuggestion = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
};

export async function searchGeocodingSuggestions(query: string): Promise<GeocodingSuggestion[]> {
  const trimmed = query.trim();

  if (trimmed.length < 3) {
    return [];
  }

  const response = await httpClient.get<GeocodingSuggestion[]>('/geocoding/search', {
    params: {
      query: trimmed,
      limit: 5,
      country: 'es'
    }
  });

  return response.data;
}
