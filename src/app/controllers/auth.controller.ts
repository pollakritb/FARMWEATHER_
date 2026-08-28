import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../http/decorators/current-user.decorator';
import { Public } from '../http/decorators/public.decorator';
import { ForgotPasswordDto, ResetPasswordDto, SetRoleDto, UpdateProfileDto } from '../dtos/account.dto';
import { AuthDto } from '../dtos/auth.dto';
import { AuthUser } from '../models/auth.types';
import { AuthService } from '../services/auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('auth/register') register(@Body() dto: AuthDto) { return this.auth.register(dto); }
  @Public() @HttpCode(200) @Post('auth/login') login(@Body() dto: AuthDto) { return this.auth.login(dto); }
  @Post('auth/logout') @HttpCode(204) logout(@CurrentUser() user: AuthUser) { return this.auth.logout(user); }
  @Public() @Post('auth/forgot-password') forgot(@Body() dto: ForgotPasswordDto) { return this.auth.requestPasswordReset(dto.username); }
  @Public() @Post('auth/reset-password') reset(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto.token, dto.newPassword); }
  @Get('auth/me') me(@CurrentUser() user: AuthUser) { return this.auth.me(user.id); }
  @Get('profile') profile(@CurrentUser() user: AuthUser) { return this.auth.me(user.id); }
  @Patch('profile') updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: AuthUser) { return this.auth.updateProfile(user.id, dto); }
  @Get('admin/users') users(@CurrentUser() user: AuthUser) { return this.auth.listUsers(user); }
  @Patch('admin/users/:id/role') role(@Param('id') id: string, @Body() dto: SetRoleDto, @CurrentUser() user: AuthUser) { return this.auth.setRole(user, id, dto.role); }
}
