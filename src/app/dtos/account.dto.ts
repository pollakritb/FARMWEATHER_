import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { UserRole } from '../models/domain';

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 100) displayName?: string;
  @IsOptional() @IsString() @Length(1, 30) phone?: string;
  @IsOptional() @IsString() @Length(1, 100) province?: string;
}
export class ForgotPasswordDto {
  @IsString() @Length(3, 30)
  @Matches(/^\w+$/, { message: 'username must contain only letters, numbers, or underscores' })
  username: string;
}
export class ResetPasswordDto {
  @IsString() @Length(32, 128) token: string;
  @IsString() @Length(12, 100)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'newPassword must contain uppercase, lowercase, and number characters' })
  newPassword: string;
}
export class SetRoleDto { @IsIn(['FARMER', 'ADMIN']) role: UserRole; }
