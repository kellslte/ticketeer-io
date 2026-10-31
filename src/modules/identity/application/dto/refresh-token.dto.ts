import { IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString() @MaxLength(256) refreshToken!: string;
}
