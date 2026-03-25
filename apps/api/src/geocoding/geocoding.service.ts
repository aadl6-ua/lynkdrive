import { Injectable, Logger } from '@nestjs/common';

export type GeocodingSuggestionDto = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
};

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly baseUrl = process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org';
  private readonly defaultCountryCodes = process.env.NOMINATIM_DEFAULT_COUNTRY_CODES ?? 'es';
  private readonly userAgent =
    process.env.NOMINATIM_USER_AGENT ?? 'lynkdrive-tfg/0.1 (contact: dev@lynkdrive.local)';
  private readonly timeoutMs = this.parsePositiveInt(process.env.NOMINATIM_TIMEOUT_MS, 3500);
  private readonly cacheTtlMs = this.parsePositiveInt(process.env.NOMINATIM_CACHE_TTL_MS, 15 * 60 * 1000);
  private readonly cacheMaxEntries = this.parsePositiveInt(process.env.NOMINATIM_CACHE_MAX_ENTRIES, 500);
  private readonly cache = new Map<string, { expiresAt: number; data: GeocodingSuggestionDto[] }>();

  async searchAddress(query: string, limit = 5, countryCodes?: string): Promise<GeocodingSuggestionDto[]> {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 3) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, 8));
    const safeCountryCodes = (countryCodes?.trim() || this.defaultCountryCodes).toLowerCase();
    const cacheKey = this.buildCacheKey(normalizedQuery, safeLimit, safeCountryCodes);
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({
      q: normalizedQuery,
      format: 'jsonv2',
      addressdetails: '1',
      limit: String(safeLimit),
      countrycodes: safeCountryCodes
    });

    const url = `${this.baseUrl}/search?${params.toString()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Language': 'es'
        }
      });

      if (!response.ok) {
        this.logger.warn(`Nominatim search failed with status ${response.status}`);
        return [];
      }

      const payload = (await response.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
        address?: {
          city?: string;
          town?: string;
          village?: string;
          municipality?: string;
          country?: string;
        };
      }>;

      const mapped = payload
        .map((item) => ({
          id: String(item.place_id),
          label: item.display_name,
          lat: Number(item.lat),
          lng: Number(item.lon),
          city:
            item.address?.city ??
            item.address?.town ??
            item.address?.village ??
            item.address?.municipality ??
            null,
          country: item.address?.country ?? null
        }))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

      this.saveToCache(cacheKey, mapped);

      return mapped;
    } catch (error) {
      this.logger.warn(`Nominatim search request failed: ${(error as Error).message}`);
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private buildCacheKey(query: string, limit: number, countryCodes: string): string {
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
    return `${normalizedQuery}::${limit}::${countryCodes}`;
  }

  private getFromCache(key: string): GeocodingSuggestionDto[] | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private saveToCache(key: string, data: GeocodingSuggestionDto[]): void {
    const now = Date.now();
    this.cache.set(key, {
      expiresAt: now + this.cacheTtlMs,
      data
    });

    this.pruneCacheIfNeeded(now);
  }

  private pruneCacheIfNeeded(now: number): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }

    if (this.cache.size <= this.cacheMaxEntries) {
      return;
    }

    // Map preserves insertion order, so removing from the front trims oldest entries first.
    while (this.cache.size > this.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;

      if (!oldestKey) {
        return;
      }

      this.cache.delete(oldestKey);
    }
  }
}