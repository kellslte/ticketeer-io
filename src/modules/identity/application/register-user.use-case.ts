import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EmailAlreadyRegisteredError } from '../domain/errors.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher.js';
import { normalizeEmail, User } from '../domain/user.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import type { RegisterDto } from './dto/register.dto.js';
import { toUserResponse } from './user-response.js';

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async execute(dto: RegisterDto) {
    // Fast path; the unique constraint in the repository is what is race-safe.
    if (await this.users.findByEmail(normalizeEmail(dto.email))) throw new EmailAlreadyRegisteredError();

    const user = User.register({
      id: randomUUID(),
      email: dto.email,
      name: dto.name,
      passwordHash: await this.hasher.hash(dto.password),
    });
    await this.users.save(user);
    return toUserResponse(user);
  }
}
