import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { RateLimit } from '../../common/rate-limit.guard.js';
import type { Response } from 'express';
import { AllowUnregistered } from '../../common/context/decorators.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AuthService, type MeView } from './auth.service.js';
import { registerSchema, type RegisterInput } from './auth.dto.js';

/**
 * Sign-up, sign-in, password reset and email verification happen in the Firebase client SDK
 * (ADR-0002). The API creates our user record and returns the user's businesses and permissions.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @AllowUnregistered()
  @RateLimit(10)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeView> {
    const { created, me } = await this.auth.register(body);
    res.status(created ? 201 : 200);
    return me;
  }

  @Get('me')
  me(): Promise<MeView> {
    return this.auth.me();
  }

  @Post('logout')
  @HttpCode(204)
  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
