import { Global, Module } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
