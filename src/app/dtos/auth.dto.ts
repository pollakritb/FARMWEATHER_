import { IsString, Length, Matches } from 'class-validator';

export class AuthDto {
  @IsString()
  @Length(3, 30)
  @Matches(/^\w+$/, { message: 'username must contain only letters, numbers, or underscores' })
  username: string;

  @IsString()
  @Length(12, 100)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'password must contain uppercase, lowercase, and number characters' })
  password: string;
}
