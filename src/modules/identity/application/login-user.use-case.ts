import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InvalidCredentialsError } from '../domain/errors.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher.js';
import { TOKEN_ISSUER, type TokenIssuer } from '../domain/token-issuer.js';
import { normalizeEmail } from '../domain/user.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import type { LoginDto } from './dto/login.dto.js';

@Injectable()
export class LoginUserUseCase {
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
  ) {}

  async execute(dto: LoginDto) {
    const user = await this.users.findByEmail(normalizeEmail(dto.email));
    // An unknown email still pays for one hash verification, so response time doesn't reveal which emails exist.
    this.dummyHash ??= this.hasher.hash(randomUUID());
    const valid = await this.hasher.verify(user ? user.passwordHash : await this.dummyHash, dto.password);
    if (!user || !valid) throw new InvalidCredentialsError();
    return this.tokens.issue(user);
  }
}
