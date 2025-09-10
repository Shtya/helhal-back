// --- File: auth/auth.controller.ts ---
import { Controller, Post, Get, Body, Res, Req, UseGuards, Query, UnauthorizedException, BadRequestException, Put, Delete, Param } from '@nestjs/common';
import { Request, Response } from 'express';
import axios from 'axios';

import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { RegisterDto, LoginDto, VerifyEmailDto, ForgotPasswordDto, ResetPasswordDto } from 'dto/user.dto';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { RolesGuard } from './guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { GoogleOauthGuard } from './guard/googleGuard.guard';
import { CRUD } from 'common/crud.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private oauthService: OAuthService,
  ) {}

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
    return res.status(201).json(result);
  }

  @Post('resend-verification-email')
  async resendVerificationEmail(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response, @Req() req: any) {
    const result = await this.authService.login(dto, res, req);
    return res.json(result);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@Req() req: any) {
    return this.authService.getCurrentUser(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('account-deactivation')
  async deactivateAccount(@Req() req: any, @Body() body: { reason: string }) {
    return this.authService.deactivateAccount(req.user.id, body.reason || 'No reason given');
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

  @Get('profile/:id')
  async getProfile(@Param('id') id: string) {
    return this.authService.getUserProfile(id);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req: any, @Body() dto: any) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  @Put('profile/skills')
  @UseGuards(JwtAuthGuard)
  async updateSkills(@Req() req: any, @Body() body: { skills: string[] }) {
    return this.authService.updateSkills(req.user.id, body.skills);
  }

  // --------- status/admin ----------
  @Put('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateStatus(@Req() req: any, @Body() body: { status: any; userId: string }) {
    const allowed = ['active', 'suspended', 'pending_verification', 'deleted'];
    if (!allowed.includes(body.status)) throw new BadRequestException('Invalid status');
    const userId = body.userId || req.user.id;
    return this.authService.updateStatus(userId, body.status);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAllUsers(@Query('') query: any) {
    return CRUD.findAll(this.authService.userRepository, 'user', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [], ['username', 'email'], { role: query.filter === 'all' ? '' : query.filter });
  }

  @Delete('user/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
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
  googleAuth(@Query('redirect') redirect?: string, @Query('ref') ref?: string) {
    const backendRedirectUri = `${process.env.BACKEND_URL}/api/v1/auth/google/callback`;
    const state = this.oauthService.createOAuthState(redirect || 'http://localhost:3000', ref);
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
      return res.redirect(`${process.env.FRONTEND_URL}/auth?accessToken=${result?.user?.accessToken}`);
    } catch {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }

  @Get('apple')
  appleAuth(@Query('redirect') redirect?: string, @Query('ref') ref?: string) {
    const redirectUrl = redirect || 'http://localhost:3000';
    const url = `https://appleid.apple.com/auth/authorize?redirect_uri=${redirectUrl}&response_type=code&client_id=${process.env.APPLE_CLIENT_ID}&scope=email&state=${this.oauthService.createOAuthState(redirectUrl, ref)}`;
    return { redirectUrl: url };
  }

  @Post('apple/callback')
  async appleCallback(@Req() req: any, @Res() res: any) {
    const { state } = req.body;
    await this.oauthService.handleAppleCallback(req.user, state, res);
    return res.redirect(`${process.env.FRONTEND_URL}`);
  }

  @Get('verify-oauth-token')
  async verifyOAuthToken(@Query('token') token: string, @Res() res: Response) {
    const decoded = this.oauthService.verifyOneTimeToken(token);
    const user = await this.oauthService['userRepository'].findOne({ where: { id: decoded.userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (decoded.referralCodeUsed && !user.referredBy) {
      await this.oauthService.processReferral(user, decoded.referralCodeUsed);
    }
    const serializedUser = await this.oauthService['authService'].authenticateUser(user, res);
    return res.json({ message: 'Authentication successful', user: serializedUser });
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
  async listSessions(@Req() req: any, @Query('active') active?: string) {
    const activeOnly = active === '1' || active === 'true';
    return this.authService.getSessionsForUser(req.user.id, { activeOnly });
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
    return res.json({ message: 'Logged out successfully' });
  }
}
