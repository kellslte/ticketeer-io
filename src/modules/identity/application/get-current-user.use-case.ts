import { Inject, Injectable } from '@nestjs/common';
import { UserNotFoundError } from '../domain/errors.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { toUserResponse } from './user-response.js';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UserNotFoundError(); // token outlived the account
    return toUserResponse(user);
  }
}
