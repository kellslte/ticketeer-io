import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '../../domain/role.js';
import { IS_PUBLIC, type AuthUser } from './decorators.js';

/**
 * Default-deny: every route needs a valid bearer token unless marked @Public().
 * Claims are trusted until expiry (short-lived), so a role change applies at next login/expiry.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing bearer token' });
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: Role }>(token);
      request.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    }
  }
}
