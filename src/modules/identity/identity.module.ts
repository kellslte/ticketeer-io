import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChangeUserRoleUseCase } from './application/change-user-role.use-case.js';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case.js';
import { LoginUserUseCase } from './application/login-user.use-case.js';
import { RegisterUserUseCase } from './application/register-user.use-case.js';
import { PASSWORD_HASHER } from './domain/password-hasher.js';
import { TOKEN_ISSUER } from './domain/token-issuer.js';
import { USER_REPOSITORY } from './domain/user.repository.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { DrizzleUserRepository } from './infrastructure/drizzle-user.repository.js';
import { JwtTokenIssuer } from './infrastructure/jwt-token-issuer.js';
import { AuthController } from './interfaces/http/auth.controller.js';
import { UsersController } from './interfaces/http/users.controller.js';

@Module({
  imports: [
    // global: the app-level JwtAuthGuard needs JwtService too.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') as never },
      }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    RegisterUserUseCase,
    LoginUserUseCase,
    GetCurrentUserUseCase,
    ChangeUserRoleUseCase,
    { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },
  ],
  exports: [USER_REPOSITORY],
})
export class IdentityModule {}
