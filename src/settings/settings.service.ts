import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from 'entities/global.entity';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private settingsRepository: Repository<Setting>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) { }
  readonly CACHE_KEY = 'app_settings';
  async getSettings() {
    let settings = await this.settingsRepository.findOne({ where: {} });

    if (!settings) {
      // Create default settings if none exist
      settings = this.settingsRepository.create({
        siteName: 'Your Platform Name',
        siteLogo: '/logo.png',
        privacyPolicy_en: 'Default privacy policy',
        termsOfService_en: 'Default terms of service',
        privacyPolicy_ar: 'سياسة الخصوصية الافتراضية',
        termsOfService_ar: 'شروط الخدمة الافتراضية',
        contactEmail: 'support@example.com',
        supportPhone: '+1234567890',
        platformPercent: 10,
        defaultCurrency: 1,
      });
      await this.settingsRepository.save(settings);
    }
    // Save to cache
    await this.cacheManager.set(this.CACHE_KEY, settings);
    return settings;
  }

  async updateSettings(updateData: Partial<Setting>) {
    let settings = await this.settingsRepository.findOne({ where: {} });

    if (!settings) {
      settings = this.settingsRepository.create(updateData);
    } else {
      Object.assign(settings, updateData);
    }

    const saved = await this.settingsRepository.save(settings);
    await this.cacheManager.set(this.CACHE_KEY, saved);
    return saved;
  }
}
