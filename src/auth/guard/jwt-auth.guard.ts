import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { TranslationService } from 'common/translation.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private readonly i18n: TranslationService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      throw err || new UnauthorizedException(this.i18n.t('auth.errors.authentication_failed'));
    }
    return user;
  }
}

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  handleRequest(err, user, info: any) {
    // Instead of throwing, just return null if no user or error
    if (err || !user) {
      return null;
    }
    return user;
  }
}