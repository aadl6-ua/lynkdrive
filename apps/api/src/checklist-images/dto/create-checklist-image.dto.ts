import { IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateChecklistImageRequest } from '@lynkdrive/shared';

export class CreateChecklistImageDto implements CreateChecklistImageRequest {
  @IsUUID()
  checklistId!: string;

  @IsString()
  @MaxLength(255)
  imageUrl!: string;
}
