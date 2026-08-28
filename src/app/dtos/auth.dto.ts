import { IsString, Length, Matches } from 'class-validator';

export class AuthDto {
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username must contain only letters, numbers, or underscores' })
  username: string;

  @IsString()
  @Length(6, 100)
  password: string;
}

