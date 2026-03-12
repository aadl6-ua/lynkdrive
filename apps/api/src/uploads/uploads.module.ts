import { Module } from '@nestjs/common';
import { UploadsController } from 'src/uploads/uploads.controller';
import { UploadsService } from 'src/uploads/uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService]
})
export class UploadsModule {}
