import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Person, User, UserRole, UserStatus } from 'entities/global.entity';
import { AuthService } from './auth.service';
import { randomBytes } from 'crypto';
import { MailService } from 'common/nodemailer';
import { RedisService } from 'common/RedisService';

@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Person)
    public personRepository: Repository<Person>,
    private authService: AuthService,
    private jwtService: JwtService,
    private configService: ConfigService,
    public emailService: MailService,

    private readonly redisService: RedisService
  ) { }


  public async getAppleClientSecret(): Promise<string> {
    const cacheKey = `apple_client_secret:${process.env.APPLE_CLIENT_ID}`;
    const cachedSecret = await this.redisService.get<string>(cacheKey);
    if (cachedSecret) return cachedSecret;

    const now = Math.floor(Date.now() / 1000); // iat must be in seconds

    // Apple's max limit: 15777000 seconds (approx 182 days)
    // We use 180 days to stay safely within the limit.
    const expiresInSeconds = 180 * 24 * 60 * 60;

    const secret = this.jwtService.sign(
      {
        iss: process.env.APPLE_TEAM_ID,     // issuer
        iat: now,                          // issued at
        exp: now + expiresInSeconds,       // expiration time
        aud: 'https://appleid.apple.com',  // audience
        sub: process.env.APPLE_CLIENT_ID,  // subject (Service ID)
      },
      {
        secret: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: process.env.APPLE_KEY_ID,   // 10-char Key ID
        },
      },
    );

    // Cache in Redis (using the same 180-day TTL)
    await this.redisService.set(cacheKey, secret, expiresInSeconds);

    return secret;
  }

  async processReferral(newUser: User, referralCodeUsed?: string): Promise<void> {
    if (!referralCodeUsed) return;

    const referrerUser = await this.userRepository.findOne({ where: { person: { referralCode: referralCodeUsed } } });
    if (referrerUser) {
      newUser.person.referredBy = referrerUser;
      newUser.person.referredById = referrerUser.id;
      referrerUser.person.referralCount = (referrerUser.referralCount || 0) + 1;
      referrerUser.person.referralRewardsCount = (referrerUser.referralRewardsCount || 0) + 1;
      await this.userRepository.save([newUser, referrerUser]);
    }
  }

  createOAuthState(redirectPath: string, referralCode?: string, type?: string): string {
    return JSON.stringify({ redirectPath, referralCode, type });
  }

  parseOAuthState(state: string): { redirectPath: string; referralCode?: string, type?: string } {
    try {
      return JSON.parse(state);
    } catch (error) {
      return { redirectPath: '/' };
    }
  }
  private async getMissingUsername(baseName) {
    const searchPattern = `${baseName}_%`;

    const result = await this.userRepository.query(
      `
     WITH numeric_usernames AS (
        SELECT
          username,
          CAST(SUBSTRING(username FROM '_(.+)$') AS TEXT) AS num_text
        FROM persons
        WHERE username LIKE $1
      ),
      valid_numbers AS (
        -- Keep only rows where numeric part matches '^[0-9\.]+$' (digits or dot)
        SELECT
          username,
          CAST(num_text AS NUMERIC) AS num
        FROM numeric_usernames
        WHERE num_text ~ '^[0-9]+$'
      ),
      ordered AS (
        -- 3️⃣ Order by number and get previous number
        SELECT
          num,
          LAG(num) OVER (ORDER BY num) AS prev_num,
          username
        FROM valid_numbers
      ),
     gap_calc AS (
      SELECT
        CASE
          -- Gap found (e.g., 1, 3 -> returns 2)
          WHEN prev_num IS NOT NULL AND num - prev_num > 1 THEN prev_num + 1
          -- Check if the sequence started after 1 (e.g., first is 2 -> returns 1)
          WHEN prev_num IS NULL AND num > 1 THEN 1
          ELSE NULL
        END AS gap_candidate
      FROM ordered
    )
          -- 4️⃣ Get smallest gap_candidate or 1 if first number >1
        SELECT
      COALESCE(
        -- 1. Look for the first empty middle slot (gap)
        (SELECT MIN(gap_candidate) FROM gap_calc WHERE gap_candidate IS NOT NULL),
        -- 2. If no gaps, get the next number after the highest one
        (SELECT MAX(num) + 1 FROM valid_numbers),
        -- 3. If no users exist at all, return 1
        1
      ) AS first_missing;`,
      [searchPattern]
    )

    const rawValue = result?.[0]?.['first_missing'];

    // Use Number() and trim to handle strings safely
    let firstMissingNum: number | null;

    if (rawValue === null || rawValue === undefined) {
      // Return a random 4-digit number (1000 to 9999)
      firstMissingNum = Math.floor(1000 + Math.random() * 9000);
    } else {
      firstMissingNum = Number(String(rawValue).trim());

    }

    const usernameSuffix = `_${firstMissingNum}`;
    const finalUsername = `${baseName}${usernameSuffix}`;
    return finalUsername;
  }

  async handleGoogleCallback(profile: any, state?: string, res?: Response) {
    const email = profile.email;
    if (!email) throw new UnauthorizedException('No email found in Google profile');

    let user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .addSelect('person.nationalId')
      .where('person.email = :email', { email: email })
      .orderBy('user.role', 'ASC')
      .getOne();

    let newUserCreated = false;
    if (!user) {
      const baseName = profile.name || email.split('@')[0];
      const finalUsername = await this.getMissingUsername(baseName);

      // 1. Create the Person
      const person = this.personRepository.create({
        username: finalUsername,
        email: email,
        googleId: profile.id,
        type: 'Individual',
      });

      // 2. Save the person FIRST to generate an ID
      const savedPerson = await this.personRepository.save(person);

      // 3. Create the User and link the SAVED person
      user = this.userRepository.create({

        role: 'buyer',
        person: savedPerson,
      });

      // 4. Save the user
      await this.userRepository.save(user);
    }
    else if (!user.googleId) {
      user.person.googleId = profile.id;
      await this.personRepository.update(user.personId, {
        googleId: profile.id
      });
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Your account is inactive. Please contact support.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    return this.finalizeOAuthAuthentication(user, state, res, newUserCreated);
  }

  async handleAppleCallback(profile: any, state?: string, res?: Response) {
    const email = profile.email;
    if (!email) throw new UnauthorizedException('No email found in Apple profile');


    let user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .addSelect('person.nationalId')
      .where('person.email = :email', { email: email })
      .orderBy('user.role', 'ASC')
      .getOne();

    let newUserCreated = false;
    if (!user) {
      const baseName = profile.name || email.split('@')[0];
      const finalUsername = await this.getMissingUsername(baseName);
      // 1. Create the Person
      const person = this.personRepository.create({
        username: finalUsername,
        email: email,
        appleId: profile.id,
        type: 'Individual',

      });

      // 2. Save the person FIRST to generate an ID
      const savedPerson = await this.personRepository.save(person);

      // 3. Create the User and link the SAVED person
      user = this.userRepository.create({
        role: 'buyer',
        person: savedPerson,
      });

      // 4. Save the user
      await this.userRepository.save(user);

      // 3. Save the User (this will automatically save the Person due to cascade)
      await this.userRepository.save(user);

      newUserCreated = true;
    } else if (!user.appleId) {
      user.person.appleId = profile.id;
      await this.personRepository.update(user.personId, {
        appleId: profile.id
      })
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Your account is inactive. Please contact support.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    return this.finalizeOAuthAuthentication(user, state, res, newUserCreated);
  }

  async finalizeOAuthAuthentication(user: User, state?: string, res?: Response, newUserCreated?: boolean) {
    let redirectPath = '/';
    let referralCodeUsed: string | undefined;
    let userType;

    if (state) {
      try {
        const parsedState = this.parseOAuthState(state);
        redirectPath = parsedState.redirectPath;
        referralCodeUsed = parsedState.referralCode;
        userType = parsedState.type;
      } catch (error) {
        console.warn('Failed to parse OAuth state:', error);
      }
    }

    if (userType === UserRole.ADMIN) {
      throw new ForbiddenException('You cannot assign yourself as admin');
    }
    // ✔ Set role only if valid
    if (userType === UserRole.BUYER || userType === UserRole.SELLER) {
      user.role = userType;
      await this.userRepository.save(user);
    }

    if (referralCodeUsed && !user.referredBy) {
      await this.processReferral(user, referralCodeUsed);
    }

    const serializedUser = await this.authService.authenticateUser(user, res);

    if (newUserCreated) {

      const emailPromises = [
        this.emailService.sendWelcomeEmail(user.email, user.username, user.role)
      ];

      if (user.role === 'seller') {
        emailPromises.push(
          this.emailService.sendSellerFeePolicyEmail(user.email, user.username)
        );
      }

      try {
        await Promise.all(emailPromises)
      } catch (err) {
        console.error('Failed to send onboarding emails:', err);
      }
    }

    return { redirectPath, user: serializedUser };
  }

  generateOneTimeToken(userId: string, referralCodeUsed?: string): string {
    return this.jwtService.sign(
      { userId, referralCodeUsed },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '30d',
      },
    );
  }

  verifyOneTimeToken(token: string): { userId: string; referralCodeUsed?: string } {
    try {
      return this.jwtService.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired one-time token');
    }
  }
}