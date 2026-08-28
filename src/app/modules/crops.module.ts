import { Module } from '@nestjs/common';
import { CropsController } from '../controllers/crops.controller';

@Module({ controllers: [CropsController] })
export class CropsModule {}
