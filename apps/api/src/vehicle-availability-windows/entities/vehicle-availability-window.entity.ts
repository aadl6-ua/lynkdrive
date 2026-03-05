import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'vehicle_availability_windows' })
export class VehicleAvailabilityWindowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Column({ name: 'start_datetime', type: 'timestamptz' })
  startDatetime!: Date;

  @Column({ name: 'end_datetime', type: 'timestamptz' })
  endDatetime!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
