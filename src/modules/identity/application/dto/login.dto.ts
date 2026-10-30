import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { trim } from '../../../../shared/dto/transforms.js';

export class LoginDto {
  @Transform(trim) @IsEmail() @MaxLength(254) email!: string;

  @IsString() @MaxLength(128) password!: string;
}
