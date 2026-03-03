import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';

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
    VehiclesModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
