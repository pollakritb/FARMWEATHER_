import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from '../controllers/auth.controller';
import { AuthGuard } from '../http/guards/auth.guard';
import { AuthService } from '../services/auth.service';

@Module({ controllers: [AuthController], providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }], exports: [AuthService] })
export class AuthModule {}
