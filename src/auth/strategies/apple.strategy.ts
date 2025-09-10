import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'entities/global.entity';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {
    super({
      clientID: configService.get('APPLE_CLIENT_ID'),
      teamID: configService.get('APPLE_TEAM_ID'),
      callbackURL: configService.get('APPLE_REDIRECT_URI'),
      keyID: configService.get('APPLE_KEY_ID'),
      privateKeyString: configService.get('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, accessToken: string, refreshToken: string, idToken: string, profile: any) {
    const decodedToken: any = this.jwtService.decode(idToken);
    if (!decodedToken || !decodedToken.sub) throw new Error('Invalid Apple ID token');

    const email = decodedToken.email || (req.body.user ? JSON.parse(req.body.user).email : null);
    if (!email) throw new Error('Email is required for Apple Sign-In');

    let user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      const username = req.body.user ? `${req.body.user.firstName} ${req.body.user.lastName}`.trim() : email.split('@')[0];
      user = this.userRepository.create({ username, email, appleId: decodedToken.sub, role: 'buyer' });
      await this.userRepository.save(user);
    } else if (!user.appleId) {
      user.appleId = decodedToken.sub;
      await this.userRepository.save(user);
    }

    return user;
  }
}