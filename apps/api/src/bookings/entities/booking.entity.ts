import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'bookings' })
export class BookingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @Column({ name: 'start_datetime', type: 'timestamptz' })
  startDatetime!: Date;

  @Column({ name: 'end_datetime', type: 'timestamptz' })
  endDatetime!: Date;

  @Column({ name: 'price_per_day_at_booking', type: 'numeric', precision: 10, scale: 2 })
  pricePerDayAtBooking!: string;

  @Column({ name: 'platform_fee', type: 'numeric', precision: 10, scale: 2, default: 0 })
  platformFee!: string;

  @Column({ name: 'total_price', type: 'numeric', precision: 10, scale: 2 })
  totalPrice!: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'accepted', 'rejected', 'paid_confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  })
  status!: 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';

  @Column({ name: 'payment_intent_id', type: 'varchar', length: 100, nullable: true })
  paymentIntentId!: string | null;

  @Column({ name: 'stripe_transfer_id', type: 'varchar', length: 100, nullable: true })
  stripeTransferId!: string | null;

  @Column({ type: 'enum', enum: ['pending', 'processing', 'paid', 'failed'], default: 'pending' })
  payoutStatus!: 'pending' | 'processing' | 'paid' | 'failed';

  @Column({ name: 'owner_contact_method', type: 'varchar', length: 255, nullable: true })
  ownerContactMethod!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
