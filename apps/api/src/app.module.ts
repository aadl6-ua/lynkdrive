import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { BookingChecklistsModule } from './booking-checklists/booking-checklists.module';
import { ChecklistImagesModule } from './checklist-images/checklist-images.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UsersModule } from './users/users.module';
import { VehicleAvailabilityWindowsModule } from './vehicle-availability-windows/vehicle-availability-windows.module';
import { VehicleImagesModule } from './vehicle-images/vehicle-images.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { UploadsModule } from './uploads/uploads.module';
import { GeocodingModule } from './geocoding/geocoding.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 300
      }
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        const synchronize = configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true';

        if (!databaseUrl) {
          throw new Error('DATABASE_URL is required');
        }

        return {
          type: 'postgres' as const,
          url: databaseUrl,
          synchronize,
          autoLoadEntities: true,
          ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false
        };
      }
    }),
    UsersModule,
    AuthModule,
    BookingsModule,
    BookingChecklistsModule,
    ChecklistImagesModule,
    PaymentsModule,
    ReviewsModule,
    VehicleAvailabilityWindowsModule,
    VehicleImagesModule,
    VehiclesModule,
    UploadsModule,
    GeocodingModule
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class AppModule {}
