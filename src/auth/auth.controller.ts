// --- File: auth/auth.controller.ts ---
import { Controller, Post, Get, Body, Res, Req, UseGuards, Query, UnauthorizedException, BadRequestException, Put, Delete, Param, UseInterceptors, UploadedFile, NotFoundException, UploadedFiles } from '@nestjs/common';
import { Request, Response } from 'express';
import axios from 'axios';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { RegisterDto, LoginDto, VerifyEmailDto, ForgotPasswordDto, ResetPasswordDto, DeactivateAccountDto, UpdateUserPermissionsDto, PhoneRegisterDto, PhoneVerifyDto, NafazDto } from 'dto/user.dto';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { AccessGuard } from './guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { SellerLevel, User, UserRole } from 'entities/global.entity';
import { CRUD } from 'common/crud.service';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CalculateRemainingImagesInterceptor, fileUploadOptions, imageUploadOptions, videoUploadOptions } from './upload.config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { promises as fsp } from 'fs';
import { join, normalize as pathNormalize } from 'path';
import { Permissions } from 'entities/permissions';
import { JwtService } from '@nestjs/jwt';


@Controller('auth')
export class AuthController {
  constructor(
    private jwtService: JwtService,

    private authService: AuthService,
    private oauthService: OAuthService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) { }

  @UseGuards(JwtAuthGuard)
  @Get('protected')
  protectedRoute(@Req() req: any) {
    return { message: `Hello user ${req.user.id}, you're authenticated.`, sessionId: req.user.sessionId };
  }

  // --------- auth core ----------
  @Post('register') async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email') async verifyEmail(@Body() dto: VerifyEmailDto, @Res() res: Response) {
    const result = await this.authService.verifyEmail(dto, res);
    res.status(201).json(result);
  }

  @Post('resend-verification-email')
  async resendVerificationEmail(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response, @Req() req: any) {
    const result = await this.authService.login(dto, res, req);
    res.json(result);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@Req() req: any) {
    return this.authService.getCurrentUser(req.user.id);
  }

  @Get('user/:id')
  async getUser(@Param('id') id: string) {
    return this.authService.getUserInfo(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('account-deactivation')
  async deactivateAccount(
    @Req() req: any,
    @Body() body: DeactivateAccountDto
  ) {
    return this.authService.deactivateAccount(
      req.user.id,
      body.reason || 'No reason given'
    );
  }


  @UseGuards(JwtAuthGuard)
  @Put('password')
  async changePassword(@Req() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  // --------- profile (moved here) ----------

  @Get('profile/stats')
  @UseGuards(JwtAuthGuard)
  async getProfileStats(@Req() req: any) {
    return this.authService.getProfileStats(req?.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getOwnProfile(@Req() req: any) {
    return this.authService.getUserProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('images')
  @UseInterceptors(CalculateRemainingImagesInterceptor, FilesInterceptor('files', 6, imageUploadOptions))
  async uploadImages(@UploadedFiles() files: any[], @Req() req: Request & { user: { id: string } }) {
    if (!files?.length) {
      throw new BadRequestException('No image files uploaded');
    }

    // convert to URLs
    const urls = files.map(f => `uploads/images/${f.filename}`);

    // update user portfolio
    const user = await this.users.findOne({ where: { id: req.user.id } });
    if (!user) throw new NotFoundException('User not found');

    const current = Array.isArray(user.portfolioItems) ? user.portfolioItems : [];
    // append new, cap at 6
    const next = [...current, ...urls].slice(-6);
    user.portfolioItems = next;
    await this.users.save(user);

    return {
      message: 'Images uploaded',
      urls,
      total: user.portfolioItems.length,
    };
  }

  private toRelPathFromUrl(raw: string, req: Request): string {
    if (!raw) return '';
    let u = raw.trim();
    if (/^https?:\/\//i.test(u)) {
      try {
        u = new URL(u).pathname;
      } catch { }
    }
    const base = process.env.BACKEND_URL?.replace(/\/+$/, '');
    if (base && u.startsWith(base)) u = u.slice(base.length);
    u = u.replace(/^\/+/, ''); // remove leading slash
    const safe = pathNormalize(u).replace(/\\/g, '/');
    if (!safe.startsWith('uploads/images/')) {
      throw new BadRequestException('Invalid image path');
    }
    return safe;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('image')
  async deleteImage(@Req() req: Request & { user: { id: string } }, @Body() body: { url: string }) {
    const rawUrl = body?.url;
    if (!rawUrl) throw new BadRequestException('url is required');

    const rel = this.toRelPathFromUrl(rawUrl, req);

    const user = await this.users.findOne({ where: { id: req.user.id } });
    if (!user) throw new NotFoundException('User not found');

    const before = Array.isArray(user.portfolioItems) ? user.portfolioItems : [];

    // Normalize both sides for comparison (handles abs vs rel stored values)
    const norm = (s: string) => this.toRelPathFromUrl(s, req);
    const after = before.filter(u => norm(u) !== rel);

    if (after.length === before.length) {
      throw new NotFoundException('Image not found in your portfolio');
    }

    user.portfolioItems = after;
    await this.users.save(user);

    // Delete file from disk (ignore if already gone)
    const abs = join(process.cwd(), rel);
    try {
      await fsp.unlink(abs);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') console.warn('unlink failed:', e);
    }

    return { message: 'Image removed', removed: rawUrl, remaining: user.portfolioItems };
  }

  @UseGuards(JwtAuthGuard)
  @Post('video')
  @UseInterceptors(FileInterceptor('file', videoUploadOptions))
  async uploadVideo(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No video file uploaded');

    const rel = `uploads/videos/${file.filename}`;
    const user = await this.users.findOne({ where: { id: req.user.id } });
    if (!user) throw new NotFoundException('User not found');

    // Delete old video if it exists
    if (user.introVideoUrl) {
      const oldPath = join(process.cwd(), user.introVideoUrl);
      try {
        await fsp.unlink(oldPath);
      } catch (err) {
        // File may not exist, ignore
        if ((err as any).code !== 'ENOENT') {
          console.error('Failed to delete old video:', err);
        }
      }
    }

    user.introVideoUrl = rel; // <-- ensure this column exists on User
    await this.users.save(user);
    return {
      message: 'Video uploaded',
      url: rel,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      path: rel,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('video')
  async deleteVideo(
    @Req() req: Request & { user: { id: string } }
  ) {
    const user = await this.users.findOne({ where: { id: req.user.id } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.introVideoUrl) {
      throw new NotFoundException('No video uploaded');
    }

    const absPath = join(process.cwd(), user.introVideoUrl);

    // Remove the file from disk
    try {
      await fsp.unlink(absPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn('Failed to delete video:', err);
      }
    }

    // Clear the DB field
    user.introVideoUrl = null;
    await this.users.save(user);

    return {
      message: 'Video removed',
      removed: user.introVideoUrl,
    };
  }


  private toRelPathFromUrl2(raw: string, allowedPrefix: string) {
    if (!raw) return '';
    let u = raw.trim();

    // If absolute URL, extract path
    if (/^https?:\/\//i.test(u)) {
      try {
        u = new URL(u).pathname;
      } catch { }
    }
    // If someone passed full BACKEND_URL + path
    const base = process.env.BACKEND_URL?.replace(/\/+$/, '');
    if (base && u.startsWith(base)) u = u.slice(base.length);

    // Normalize & clean
    u = u.replace(/^\/+/, '');
    const safe = pathNormalize(u).replace(/\\/g, '/');

    if (!safe.startsWith(allowedPrefix)) {
      throw new BadRequestException('Invalid path');
    }
    return safe;
  }

  @UseGuards(JwtAuthGuard)
  @Post('portfolio-file')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async uploadPortfolioFile(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No document uploaded');

    const rel = `uploads/files/${file.filename}`;

    const user = await this.users.findOne({ where: { id: req.user.id } });
    if (!user) throw new NotFoundException('User not found');

    // Delete old file if exists
    if (user?.portfolioFile) {
      try {
        const oldRel = this.toRelPathFromUrl2(user.portfolioFile.url, 'uploads/files/');
        await fsp.unlink(join(process.cwd(), oldRel));
      } catch (e: any) {
        if (e?.code !== 'ENOENT') console.warn('unlink old portfolioFile failed:', e);
      }
    }

    user.portfolioFile = {
      url: rel,
      filename: file.originalname
    }
    await this.users.save(user);

    return {
      message: 'Portfolio file uploaded',
      url: rel,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      path: rel,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('portfolio-file')
  async deletePortfolioFile(@Req() req: Request & { user: { id: string } }, @Body() body: { url?: string }) {
    const user = await this.users.findOne({ where: { id: req.user.id } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.portfolioFile) {
      throw new NotFoundException('No portfolio file to delete');
    }

    // If a URL is provided, make sure it matches the stored one
    if (body?.url) {
      const storedRel = this.toRelPathFromUrl2(user?.portfolioFile.url, 'uploads/files/');
      const givenRel = this.toRelPathFromUrl2(body.url, 'uploads/files/');
      if (storedRel !== givenRel) {
        throw new BadRequestException('Provided file does not match current portfolio file');
      }
    }

    // Delete the file from disk
    try {
      const rel = this.toRelPathFromUrl2(user?.portfolioFile.url, 'uploads/files/');
      await fsp.unlink(join(process.cwd(), rel));
    } catch (e: any) {
      if (e?.code !== 'ENOENT') console.warn('unlink portfolioFile failed:', e);
    }

    // Clear DB
    user.portfolioFile = null as any;
    await this.users.save(user);

    return { message: 'Portfolio file deleted' };
  }

  @Get('profile/:id')
  async getProfile(@Param('id') id: string) {
    return this.authService.getUserProfile(id);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req: any, @Body() dto: any) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  @Put('profile/:id')
  @UseGuards(JwtAuthGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'users',
      value: Permissions.Users.Edit
    }
  })
  async adminUpdateProfile(@Param('id') id: string, @Req() req: any, @Body() dto: any) {
    return this.authService.updateProfile(id, dto, req.user.id);
  }


  @Put('profile/skills')
  @UseGuards(JwtAuthGuard)
  async updateSkills(@Req() req: any, @Body() body: { skills: string[] }) {
    return this.authService.updateSkills(req.user.id, body.skills);
  }

  // --------- status/admin ----------
  @Put('status')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'users',
      value: Permissions.Users.ChangeStatus
    }
  })
  async updateStatus(@Req() req: any, @Body() body: { status: any; userId: string }) {
    const allowed = ['active', 'suspended', 'pending_verification', 'deleted'];
    if (!allowed.includes(body.status)) throw new BadRequestException('Invalid status');
    const userId = body.userId || req.user.id;
    return this.authService.updateStatus(userId, body.status);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'users',
      value: Permissions.Users.View
    }
  })
  async getAllUsers(@Query('') query: any, @Req() req: any) {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy,
      sortOrder = 'DESC',
      filter,
      status,
      hasPermissions
    } = query;
    const role = req.user?.role;

    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // 1. Initialize QueryBuilder
    const qb = this.authService.userRepository.createQueryBuilder('user');

    // 2. Joins (MUST be first)
    qb.leftJoinAndSelect('user.person', 'person')
      .skip(skip)
      .take(limitNumber);

    // 3. Filtering Logic
    if (filter && filter !== 'all') {
      qb.andWhere('user.role = :role', { role: filter });
    }

    if (status && status !== 'all') {
      if (status === 'Deleted') {
        qb.andWhere('user.deleted_at IS NOT NULL');
      } else {
        qb.andWhere('person.status = :status', { status });
      }
    }

    // Permission filtering for Admin
    if (role === 'admin' && hasPermissions && hasPermissions !== 'all') {
      if (hasPermissions === 'true') {
        qb.andWhere('person.permissions IS NOT NULL');
      } else {
        qb.andWhere('person.permissions IS NULL');
      }
    }

    // 4. Search Logic (Username and Email)
    if (search) {
      qb.andWhere(new Brackets(innerQb => {
        innerQb.where('LOWER(person.username) LIKE LOWER(:search)', { search: `%${search}%` })
          .orWhere('LOWER(person.email) LIKE LOWER(:search)', { search: `%${search}%` });
      }));
    }

    // 5. Sorting Logic
    const sortField = sortBy || 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Metadata check for sorting
    const columnExists = this.authService.userRepository.metadata.columns.some(
      col => col.propertyName === sortField
    );

    if (!columnExists) {
      throw new BadRequestException(`Invalid sortBy field: '${sortField}'`);
    }
    qb.orderBy(`user.${sortField}`, sortDirection);

    // 6. Execution and Final Return
    const [data, total] = await qb.getManyAndCount();

    return {
      total_records: total,
      current_page: pageNumber,
      per_page: limitNumber,
      records: data,
    };
  }

  @Delete('user/:id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'users',
      value: Permissions.Users.Delete
    }
  })
  async deleteUser(@Param('id') id: string) {
    return this.authService.deleteUser(id);
  }

  // --------- tokens / oauth (unchanged) ----------
  @Post('refresh') async refreshTokens(@Req() req: Request) {
    const { refreshToken } = req.body as any;
    if (!refreshToken) throw new BadRequestException('Refresh token not provided in the request body');
    return this.authService.refreshTokens(refreshToken);
  }

  @Post('forgot-password') async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password') async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('google')
  googleAuth(@Query('redirect') redirect?: string, @Query('ref') ref?: string, @Query('type') type?: string) {
    const backendRedirectUri = `${process.env.BACKEND_URL}/api/v1/auth/google/callback`;
    const state = this.oauthService.createOAuthState(redirect || process.env.FRONTEND_URL, ref, type);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${encodeURIComponent(backendRedirectUri)}&response_type=code&client_id=${process.env.GOOGLE_CLIENT_ID}&scope=email%20profile&state=${encodeURIComponent(state)}&access_type=offline`;
    return { redirectUrl: url.replace(/\s+/g, '') };
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.BACKEND_URL}/api/v1/auth/google/callback`,
        grant_type: 'authorization_code',
      });

      const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      });

      const result: any = await this.oauthService.handleGoogleCallback(userInfoResponse.data, state, res);

      return res.redirect(`${process.env.FRONTEND_URL}/auth?accessToken=${result?.user?.accessToken}&refreshToken=${result?.user?.refreshToken}&${result?.redirectPath ? 'redirect=' + encodeURIComponent(result.redirectPath) : ''}`);
    } catch (e) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth?tab=login&error=oauth_failed&error_message=${e.message}`);
    }
  }

  @Get('apple')
  appleAuth(@Query('redirect') redirect?: string, @Query('ref') ref?: string, @Query('type') type?: string) {
    const backendRedirectUri = `${process.env.BACKEND_URL}/api/v1/auth/apple/callback`;
    const state = this.oauthService.createOAuthState(redirect || process.env.FRONTEND_URL, ref, type);
    const url = `https://appleid.apple.com/auth/authorize?redirect_uri=${backendRedirectUri}&response_type=code&client_id=${process.env.APPLE_CLIENT_ID}&scope=name%20email&response_mode=form_post&state=${encodeURIComponent(state)}`;
    return { redirectUrl: url.replace(/\s+/g, '') };
  }


  @Post('apple/callback')
  async appleCallback(@Req() req: any, @Res() res: any) {
    try {

      //fix this 
      const { code, state, user } = req.body;
      let name: string | null = null;

      if (user && typeof user === 'object' && user.name) {
        const { firstName, lastName } = user.name;
        name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
      }

      const APPLE_CLIENT_SECRET = await this.oauthService.getAppleClientSecret();

      // Exchange code for tokens
      const tokenResponse = await axios.post('https://appleid.apple.com/auth/token', new URLSearchParams({
        client_id: process.env.APPLE_CLIENT_ID,
        client_secret: APPLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.BACKEND_URL}/api/v1/auth/apple/callback`
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (!tokenResponse.data.id_token) {
        throw new Error('Invalid token response from Apple');
      }

      const { id_token } = tokenResponse.data;
      const decoded: any = this.jwtService.decode(id_token);
      const appleUserId = decoded?.sub;

      const profile = { ...user, name, id: appleUserId }
      const result: any = await this.oauthService.handleAppleCallback(profile, state, res);
      return res.redirect(`${process.env.FRONTEND_URL}/auth?accessToken=${result?.user?.accessToken}&refreshToken=${result?.user?.refreshToken}&${result?.redirectPath ? 'redirect=' + encodeURIComponent(result.redirectPath) : ''}`);
    } catch (e) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth?tab=login&error=oauth_failed&error_message=${e.message}`);
    }
  }
  //🔹 loged in users phone verification flow
  @Post('send-phone-verification-otp')
  @UseGuards(JwtAuthGuard)
  async sendPhoneVerification(@Req() req: any) {
    const userId = req.user.id;
    return this.authService.sendPhoneVerificationOTP(userId);
  }

  @Post('verify-phone-otp')
  @UseGuards(JwtAuthGuard)
  async verifyPhoneOtp(@Req() req: any) {
    const { otpCode } = req.body as any;
    const userId = req.user.id;
    return this.authService.verifyPhoneOTP(userId, otpCode);
  }

  // 🔹 Login with phone
  @Post('phone')
  async phone(@Body() dto: PhoneRegisterDto) {
    return this.authService.phoneAuth(dto);
  }
  @Post('verify-phone')
  async verifyPhone(@Body() dto: PhoneVerifyDto, @Res() res: Response, @Req() req: any) {
    const result = await this.authService.verifyOTP(dto, req, res);
    res.json(result);
  }

  @Post('nafath-mfa')
  @UseGuards(JwtAuthGuard)
  async startNafathMfa(@Body() dto: NafazDto, @Req() req: any) {
    return this.authService.initiateNafathFlow(req.user.id, dto);
  }

  @Post('nafath-mfa/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelNafathMfa(@Req() req: any) {
    const userId = req.user.id;
    return this.authService.cancelNafathFlow(userId);
  }

  @Get('verify-oauth-token')
  async verifyOAuthToken(@Query('token') token: string, @Res() res: Response) {
    const decoded = this.oauthService.verifyOneTimeToken(token);

    const user = await this.oauthService['userRepository']
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .where('user.id = :id', { id: decoded.userId })
      .getOne();

    if (!user) throw new UnauthorizedException('User not found');
    if (decoded.referralCodeUsed && !user.referredBy) {
      await this.oauthService.processReferral(user, decoded.referralCodeUsed);
    }

    const serializedUser = await this.oauthService['authService'].authenticateUser(user, res);
    res.json({ message: 'Authentication successful', user: serializedUser });
  }

  @Get('search')
  async getSearch(@Query() query: any, @Req() req: any) {
    return CRUD.findAll(
      this.authService.userRepository,
      'user',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [],
      ['username', 'email'],
      {}, // filter
    );
  }

  // auth.controller.ts
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async listSessions(
    @Req() req: any,
    @Query('active') active?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const activeOnly = active === '1' || active === 'true';

    const parsedLimit = Math.min(parseInt(limit || '50', 10), 200); // max safety limit

    return this.authService.getSessionsForUser(req.user.id, {
      activeOnly,
      cursor,
      limit: parsedLimit,
    });
  }

  // Revoke a specific session (device logout)
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(@Req() req: any, @Param('id') id: string) {
    return this.authService.logoutSession(req.user.id, id);
  }

  // Revoke all other sessions (keep current)
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAllOthers(@Req() req: any) {
    const keepSessionId = req.user.sessionId;
    return this.authService.logoutAllExcept(req.user.id, keepSessionId);
  }

  // Logout current session
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logoutCurrent(@Req() req: any, @Res() res: Response) {
    const sid = req.user.sessionId;
    if (sid) await this.authService.logoutSession(req.user.id, sid);
    this.authService.clearTokenCookies(res);
    res.json({ message: 'Logged out successfully' });
  }

  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'users',
      value: Permissions.Users.UpdateLevel
    }
  })
  @Put('users/:id/level')
  async updateSellerLevel(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: { sellerLevel: SellerLevel },
  ) {
    return this.authService.updateSellerLevel(id, dto.sellerLevel, req.user.id);
  }


  @Post('request-email-change')
  @UseGuards(JwtAuthGuard)
  async requestEmailChange(@Req() req: any, @Body() body: { newEmail: string }) {
    return this.authService.requestEmailChange(req.user.id, body.newEmail);
  }

  @Post('resend-email-confirmation')
  @UseGuards(JwtAuthGuard)
  async resendEmailConfirmation(@Req() req: any) {
    return this.authService.resendEmailConfirmation(req.user.id);
  }

  @Post('cancel-email-change')
  @UseGuards(JwtAuthGuard)
  async cancelEmailChange(@Req() req: any) {
    return this.authService.cancelEmailChange(req.user.id);
  }

  @Get('confirm-email-change')
  async confirmEmailChange(
    @Query('userId') userId: string,
    @Query('pendingEmail') pendingEmail: string,
    @Query('code') code: string,
    @Res() res: any
  ) {
    try {
      await this.authService.confirmEmailChange(userId, pendingEmail, code);

      return res.redirect(`${process.env.FRONTEND_URL}`);
    } catch (err) {
      console.error(err);
      return res.redirect(`${process.env.FRONTEND_URL}/auth?tab=login&error=confirmation_failed`);
    }
  }

  @Get('users/admin')
  async getAdminUser() {
    return this.authService.getFirstAdmin();
  }


  @Post('create-seller-account')
  @UseGuards(JwtAuthGuard)
  async createSellerSubAccount(
    @Req() req,
    @Res() res: Response,
  ) {
    const result = await this.authService.createSellerSubAccount(req.user.id, res, req);
    res.json(result);
  }


  // ------------------ New endpoint ------------------
  @Post('login-as-related/:relatedUserId')
  @UseGuards(JwtAuthGuard)
  async loginAsRelated(
    @Req() req: any,
    @Res() res: Response,
    @Param('relatedUserId') relatedUserId: string,
  ) {
    const currentUserId = req.user.id;

    // Delegate to authService
    const result = await this.authService.loginAsRelatedUser(
      currentUserId,
      relatedUserId,
      res,
      req,
    );

    res.json(result);
  }


  @Put(':id/permissions')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN] })
  async updatePermissions(@Body() dto: UpdateUserPermissionsDto, @Param('id') id: string) {
    return this.authService.updateUserPermissions(id, dto);
  }
}