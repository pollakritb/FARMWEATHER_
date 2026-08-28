import { Module } from '@nestjs/common';
import { PlotsController } from '../controllers/plots.controller';
import { PlotsService } from '../services/plots.service';

@Module({
  controllers: [PlotsController],
  providers: [PlotsService],
  exports: [PlotsService],
})
export class PlotsModule {}
