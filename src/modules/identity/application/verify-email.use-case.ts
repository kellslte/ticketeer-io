import { Inject, Injectable } from '@nestjs/common';
import { InvalidVerificationTokenError } from '../domain/errors.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { EmailVerificationTokens } from '../infrastructure/email-verification-tokens.js';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly tokens: EmailVerificationTokens,
  ) {}

  async execute(token: string) {
    const userId = this.tokens.verify(token);
    const user = userId ? await this.users.findById(userId) : null;
    if (!user) throw new InvalidVerificationTokenError();
    user.verifyEmail();
    await this.users.save(user);
  }
}
