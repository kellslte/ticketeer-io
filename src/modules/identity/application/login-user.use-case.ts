import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccountLockedError, InvalidCredentialsError } from '../domain/errors.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher.js';
import { normalizeEmail } from '../domain/user.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import type { LoginDto } from './dto/login.dto.js';
import { SessionService } from './session.service.js';

@Injectable()
export class LoginUserUseCase {
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
  ) {}

  async execute(dto: LoginDto) {
    const user = await this.users.findByEmail(normalizeEmail(dto.email));

    if (user?.isLocked()) {
      throw new AccountLockedError();
    }

    // An unknown email still pays for one hash verification, so response time doesn't reveal which emails exist.
    this.dummyHash ??= this.hasher.hash(randomUUID());
    const valid = await this.hasher.verify(user ? user.passwordHash : await this.dummyHash, dto.password);

    if (!user || !valid) {
      if (user) {
        user.recordFailedLogin();
        await this.users.save(user);
        if (user.isLocked()) {
          throw new AccountLockedError();
        }
      }
      throw new InvalidCredentialsError();
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      user.recordSuccessfulLogin();
      await this.users.save(user);
    }

    return this.sessions.open(user);
  }
}
