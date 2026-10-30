import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LoginDto } from '../../application/dto/login.dto.js';
import { RegisterDto } from '../../application/dto/register.dto.js';
import { GetCurrentUserUseCase } from '../../application/get-current-user.use-case.js';
import { LoginUserUseCase } from '../../application/login-user.use-case.js';
import { RegisterUserUseCase } from '../../application/register-user.use-case.js';
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

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.getCurrentUser.execute(user.id);
  }
}
