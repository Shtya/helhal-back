import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserSession } from 'entities/global.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectRepository(UserSession) private sessionsRepo: Repository<UserSession>,) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        req => {
          if (req?.headers?.authorization) {
            const authHeader = req.headers.authorization.split(' ');
            if (authHeader[0] === 'Bearer' && authHeader[1]) {
              return authHeader[1];
            }
          }
          // Fall back to cookies if Authorization header is not present
          return req?.cookies?.accessToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    // Check session
    const session = await this.sessionsRepo.findOne({
      where: { id: payload.sid, userId: payload.id }
    });
    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Session is revoked');
    }

    // Return all info needed by guards
    return {
      id: payload.id,
      sessionId: payload.sid,
      role: payload.role,           // <--- add this
      permissions: payload.permissions, // <--- add this
    };
  }

}
