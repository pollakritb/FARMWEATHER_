import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { UserRole } from '../models/domain';

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 100) displayName?: string;
  @IsOptional() @IsString() @Length(1, 30) phone?: string;
  @IsOptional() @IsString() @Length(1, 100) province?: string;
}
export class ForgotPasswordDto { @IsString() username: string; }
export class ResetPasswordDto {
  @IsString() token: string;
  @IsString() @Length(12, 100) newPassword: string;
}
export class SetRoleDto { @IsIn(['FARMER', 'ADMIN']) role: UserRole; }
