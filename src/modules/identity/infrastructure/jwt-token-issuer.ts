import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenIssuer } from '../domain/token-issuer.js';
import type { User } from '../domain/user.js';

@Injectable()
export class JwtTokenIssuer implements TokenIssuer {
  constructor(private readonly jwt: JwtService) {}

  async issue(user: User) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const { iat, exp } = this.jwt.decode<{ iat: number; exp: number }>(accessToken);
    return { accessToken, expiresIn: exp - iat };
  }
}
