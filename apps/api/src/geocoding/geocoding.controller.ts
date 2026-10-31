import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Query } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';

function parseOptionalPositiveInt(value?: string): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get('search')
  async searchAddress(@Query() query: Record<string, string | undefined>) {
    const text = query.query?.trim() ?? '';
    const limit = parseOptionalPositiveInt(query.limit) ?? 5;
    const country = query.country?.trim();

    return this.geocodingService.searchAddress(text, limit, country);
  }
}
