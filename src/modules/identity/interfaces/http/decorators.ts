import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../../domain/role.js';

export interface AuthUser {
  id: string;
  role: Role;
}

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Opt a route out of the global JwtAuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Restrict a route to these roles (checked by the global RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
