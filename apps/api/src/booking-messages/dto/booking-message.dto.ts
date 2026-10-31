import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type {
  BookingMessageResponse,
  CreateBookingMessageRequest,
  MarkBookingMessagesReadRequest
} from '@lynkdrive/shared';

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGES_DEFAULT_LIMIT = 50;
export const MESSAGES_MAX_LIMIT = 100;

export class CreateBookingMessageDto implements CreateBookingMessageRequest {
  @IsUUID()
  bookingId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MESSAGE_MAX_LENGTH)
  body!: string;
}

export class MarkBookingMessagesReadDto implements MarkBookingMessagesReadRequest {
  @IsUUID()
  bookingId!: string;
}

/** Query de `GET /booking-messages`: `after` y `before` son ids de mensaje (cursor). */
export class ListBookingMessagesQueryDto {
  @IsUUID()
  bookingId!: string;

  @IsOptional()
  @IsUUID()
  after?: string;

  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MESSAGES_MAX_LIMIT)
  limit: number = MESSAGES_DEFAULT_LIMIT;
}

export class BookingMessageResponseDto implements BookingMessageResponse<Date> {
  id!: string;
  bookingId!: string;
  senderId!: string;
  body!: string;
  createdAt!: Date;
  readAt!: Date | null;
}
