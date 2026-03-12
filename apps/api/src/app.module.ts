import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { UsersModule } from './users/users.module';
import { VehicleAvailabilityWindowsModule } from './vehicle-availability-windows/vehicle-availability-windows.module';
import { VehicleImagesModule } from './vehicle-images/vehicle-images.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
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
    VehicleAvailabilityWindowsModule,
    VehicleImagesModule,
    VehiclesModule,
    UploadsModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
