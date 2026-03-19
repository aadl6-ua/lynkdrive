import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'booking_checklists' })
export class BookingChecklistEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @Column({ type: 'enum', enum: ['check_in', 'check_out'] })
  type!: 'check_in' | 'check_out';

  @Column({ name: 'submitted_by', type: 'uuid' })
  submittedBy!: string;

  @Column({ type: 'integer' })
  mileage!: number;

  @Column({ name: 'fuel_level', type: 'integer' })
  fuelLevel!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
