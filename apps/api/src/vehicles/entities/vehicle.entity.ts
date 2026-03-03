import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'vehicles' })
export class VehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 100 })
  brand!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'integer' })
  year!: number;

  @Column({ name: 'license_plate', type: 'varchar', length: 20, unique: true })
  licensePlate!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'price_per_day', type: 'numeric', precision: 10, scale: 2 })
  pricePerDay!: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  location!: unknown;

  @Column({ name: 'location_address', type: 'varchar', length: 255 })
  locationAddress!: string;

  @Column({ name: 'fuel_type', type: 'enum', enum: ['gasoline', 'diesel', 'electric', 'hybrid'], nullable: true })
  fuelType!: 'gasoline' | 'diesel' | 'electric' | 'hybrid' | null;

  @Column({ type: 'enum', enum: ['manual', 'automatic'], nullable: true })
  transmission!: 'manual' | 'automatic' | null;

  @Column({ type: 'integer', nullable: true })
  seats!: number | null;

  @Column({ type: 'enum', enum: ['active', 'inactive'], default: 'active' })
  status!: 'active' | 'inactive';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
