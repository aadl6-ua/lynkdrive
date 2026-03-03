import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 20, nullable: true, unique: true })
  phoneNumber!: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 255, nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'id_document_url', type: 'varchar', length: 255, nullable: true })
  idDocumentUrl!: string | null;

  @Column({ name: 'driver_license_url', type: 'varchar', length: 255, nullable: true })
  driverLicenseUrl!: string | null;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 100, nullable: true })
  stripeCustomerId!: string | null;

  @Column({ name: 'stripe_account_id', type: 'varchar', length: 100, nullable: true })
  stripeAccountId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
