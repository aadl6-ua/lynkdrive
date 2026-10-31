import type { ChecklistImageResponse } from '@lynkdrive/shared';

export class ChecklistImageResponseDto implements ChecklistImageResponse<Date> {
  id!: string;
  checklistId!: string;
  imageUrl!: string;
  createdAt!: Date;
}
