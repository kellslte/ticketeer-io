import { Inject, Injectable } from '@nestjs/common';
import { CannotChangeOwnRoleError, UserNotFoundError } from '../domain/errors.js';
import type { Role } from '../domain/role.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { toUserResponse } from './user-response.js';

@Injectable()
export class ChangeUserRoleUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  /** Caller is already known to be an admin (RolesGuard). */
  async execute(actorId: string, targetId: string, role: Role) {
    // An admin demoting themselves could leave the system with no admin.
    if (actorId === targetId) throw new CannotChangeOwnRoleError();
    const user = await this.users.findById(targetId);
    if (!user) throw new UserNotFoundError();
    user.changeRole(role);
    await this.users.save(user);
    return toUserResponse(user);
  }
}
