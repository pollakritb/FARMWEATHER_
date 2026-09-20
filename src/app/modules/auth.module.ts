import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from '../controllers/auth.controller';
import { AuthGuard } from '../http/guards/auth.guard';
import { AuthService } from '../services/auth.service';

@Module({ controllers: [AuthController], providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useClass: ThrottlerGuard }], exports: [AuthService] })
export class AuthModule {}
