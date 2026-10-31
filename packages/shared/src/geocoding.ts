/** Elemento de `GET /geocoding/search`. */
export interface GeocodingSuggestion {
  id: string;
  label: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
}
