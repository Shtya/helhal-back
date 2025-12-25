import { Controller, Get, Put, Body, UseGuards, Post, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AccessGuard } from '../auth/guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { SettingsService } from './settings.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { logoUploadOptions } from 'common/upload.config';
import { join } from 'path';
import { promises as fsp } from 'fs';
import { Permissions } from 'entities/permissions';


@Controller('settings')

export class SettingsController {
  constructor(private settingsService: SettingsService) { }

  @Get('public')
  async getPublicSettings() {
    const settings = await this.settingsService.getSettings();

    return {
      privacyPolicy_en: settings.privacyPolicy_en,
      termsOfService_en: settings.termsOfService_en,
      privacyPolicy_ar: settings.privacyPolicy_ar,
      termsOfService_ar: settings.termsOfService_ar,
      contactEmail: settings.contactEmail,
      sellerFaqs_en: settings.sellerFaqs_en,
      sellerFaqs_ar: settings.sellerFaqs_ar,
      inviteFaqs_en: settings.inviteFaqs_en,
      inviteFaqs_ar: settings.inviteFaqs_ar,
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
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'settings',
      value: Permissions.Settings.Update
    }
  })
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'settings',
      value: Permissions.Settings.Update
    }
  })
  async updateSettings(@Body() updateSettingsDto: any) {
    return this.settingsService.updateSettings(updateSettingsDto);
  }

  @Post('uploads/siteLogo')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'settings',
      value: Permissions.Settings.Update
    }
  })
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
