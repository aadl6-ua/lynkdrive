import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateChecklistImageDto {
  @IsUUID()
  checklistId!: string;

  @IsString()
  @MaxLength(255)
  imageUrl!: string;
}
