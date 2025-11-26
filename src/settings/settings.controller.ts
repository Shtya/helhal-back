import { Controller, Get, Put, Body, UseGuards, Post, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { SettingsService } from './settings.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { logoUploadOptions } from 'common/upload.config';
import { join } from 'path';
import { promises as fsp } from 'fs';


@Controller('settings')

export class SettingsController {
  constructor(private settingsService: SettingsService) { }

  @Get('public')
  async getPublicSettings() {
    const settings = await this.settingsService.getSettings();

    return {
      privacyPolicy: settings.privacyPolicy,
      termsOfService: settings.termsOfService,
      contactEmail: settings.contactEmail,
      faqs: settings.faqs,
      siteName: settings.siteName,
      siteLogo: settings.siteLogo,
      facebook: settings.facebook,
      twitter: settings.twitter,
      instagram: settings.instagram,
      linkedin: settings.linkedin,
      pinterest: settings.pinterest,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateSettings(@Body() updateSettingsDto: any) {
    return this.settingsService.updateSettings(updateSettingsDto);
  }

  @Post('uploads/siteLogo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', logoUploadOptions))
  async uploadSiteLogo(@UploadedFile() file: any, @Req() req) {
    if (!file) {
      throw new Error('No file provided or invalid file type');
    }

    // Save the logo URL in DB or settings (optional)
    const logoUrl = `/uploads/siteLogo/${file.filename}`;

    // Get current settings to check old logo
    const settings = await this.settingsService.getSettings();
    const oldLogoUrl = settings?.siteLogo;

    // Delete old logo if it exists
    if (oldLogoUrl) {
      const oldPath = join(process.cwd(), oldLogoUrl);
      try {
        await fsp.unlink(oldPath);
      } catch (err: any) {
        // Ignore if file does not exist
        if (err.code !== 'ENOENT') {
          console.error('Failed to delete old logo:', err);
        }
      }
    }
    await this.settingsService.updateSettings({ siteLogo: logoUrl });

    return { url: logoUrl };
  }
}
