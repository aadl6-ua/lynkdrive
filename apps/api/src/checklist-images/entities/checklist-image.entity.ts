import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'checklist_images' })
export class ChecklistImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'checklist_id', type: 'uuid' })
  checklistId!: string;

  @Column({ name: 'image_url', type: 'varchar', length: 255 })
  imageUrl!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
