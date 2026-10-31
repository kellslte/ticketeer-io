import { Inject, Injectable } from '@nestjs/common';
import { UserNotFoundError } from '../domain/errors.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';

@Injectable()
export class ResendVerificationUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UserNotFoundError();
    user.requestEmailVerification(); // no-op when already verified
    await this.users.save(user);
  }
}
