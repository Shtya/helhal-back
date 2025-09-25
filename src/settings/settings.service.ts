import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from 'entities/global.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private settingsRepository: Repository<Setting>,
  ) {}

  async getSettings() {
    let settings = await this.settingsRepository.findOne({ where: {} });

    if (!settings) {
      // Create default settings if none exist
      settings = this.settingsRepository.create({
        siteName: 'Your Platform Name',
        siteLogo: '/logo.png',
        privacyPolicy: 'Default privacy policy',
        termsOfService: 'Default terms of service',
        contactEmail: 'support@example.com',
        supportPhone: '+1234567890',
        platformPercent: 10,
        defaultCurrency: 1,
      });
      await this.settingsRepository.save(settings);
    }

    return settings;
  }

  async updateSettings(updateData: Partial<Setting>) {
    let settings = await this.settingsRepository.findOne({ where: {} });

    if (!settings) {
      settings = this.settingsRepository.create(updateData);
    } else {
      Object.assign(settings, updateData);
    }

    return this.settingsRepository.save(settings);
  }
}
