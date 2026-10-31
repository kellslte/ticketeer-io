import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LoginDto } from '../../application/dto/login.dto.js';
import { RegisterDto } from '../../application/dto/register.dto.js';
import { RefreshTokenDto } from '../../application/dto/refresh-token.dto.js';
import { VerifyEmailDto } from '../../application/dto/verify-email.dto.js';
import { GetCurrentUserUseCase } from '../../application/get-current-user.use-case.js';
import { LoginUserUseCase } from '../../application/login-user.use-case.js';
import { RegisterUserUseCase } from '../../application/register-user.use-case.js';
import { ResendVerificationUseCase } from '../../application/resend-verification.use-case.js';
import { SessionService } from '../../application/session.service.js';
import { VerifyEmailUseCase } from '../../application/verify-email.use-case.js';
import { CurrentUser, Public, type AuthUser } from './decorators.js';

// Brute-force protection: far tighter than the global default.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly loginUser: LoginUserUseCase,
    private readonly getCurrentUser: GetCurrentUserUseCase,
    private readonly sessions: SessionService,
    private readonly verifyEmail: VerifyEmailUseCase,
    private readonly resendVerification: ResendVerificationUseCase,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.registerUser.execute(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.loginUser.execute(dto);
  }

  /** Rotates: the presented token stops working and a new pair is returned. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.sessions.rotate(dto.refreshToken);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(204)
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    await this.sessions.logout(dto.refreshToken);
  }

  // GET so the emailed link works as-is; verifying is idempotent.
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get('verify-email')
  async verify(@Query() query: VerifyEmailDto) {
    await this.verifyEmail.execute(query.token);
    return { verified: true };
  }

  @ApiBearerAuth()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(202)
  @Post('resend-verification')
  async resend(@CurrentUser() user: AuthUser) {
    await this.resendVerification.execute(user.id);
    return { queued: true };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.getCurrentUser.execute(user.id);
  }
}
