import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'entities/global.entity';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ['profile', 'email'],
      passReqToCallback: true,
    });
  }

  async validate(req: any, accessToken: string, refreshToken: string, profile: any) {
    const email = profile.emails?.[0]?.value;
    if (!email) throw new Error('No email found in Google profile');

    let user = await this.userRepository.findOne({ where: { person: { email } } });
    if (!user) {
      user = this.userRepository.create({ username: profile.displayName.trim(), email, googleId: profile.id, role: 'buyer' });
      await this.userRepository.save(user);
    } else if (!user.googleId) {
      user.person.googleId = profile.id;
      await this.userRepository.save(user);
    }

    return user;
  }
}