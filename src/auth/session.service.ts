// auth/session.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, DeviceInfo } from 'entities/global.entity';
import { Request } from 'express';
import * as crypto from 'crypto'; // add this

@Injectable()
export class SessionService {
  constructor(@InjectRepository(User) private userRepository: Repository<User>) {}

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLogin: new Date() });
  }

  // auth/session.service.ts

  async trackDevice(userId: string, deviceInfo: Partial<DeviceInfo>): Promise<string | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return null;

    // normalize devices array
    user.devices = Array.isArray(user.devices) ? user.devices : [];

    // normalize helpers (important if seeders used "Desktop" and runtime uses "desktop")
    const norm = (s?: string) => (s || 'unknown').toLowerCase();
    const incoming = {
      device_type: norm(deviceInfo.device_type),
      // keep browser & os case-stable for readability in UI
      browser: deviceInfo.browser || 'Unknown',
      os: deviceInfo.os || 'Unknown',
      ip_address: deviceInfo.ip_address || 'unknown',
    };

    // 👉 key change: include browser + os in the identity
    // (IP is *not* included so the same device seen from different networks
    // won't create duplicates; add ip if you want network-sensitive uniqueness)
    const idx = user.devices.findIndex((d: any) => norm(d.device_type) === incoming.device_type && (d.browser || 'Unknown') === incoming.browser && (d.os || 'Unknown') === incoming.os);

    const now = new Date();
    let deviceId: string;

    if (idx >= 0) {
      // update only what's changed, keep stable id
      const prev = user.devices[idx] as any;
      deviceId = prev.id || crypto.randomUUID();
      user.devices[idx] = {
        ...prev,
        id: deviceId,
        ip_address: incoming.ip_address, // update latest seen IP
        last_activity: now,
      };
    } else {
      // new device
      deviceId = crypto.randomUUID();
      const next: any = {
        id: deviceId,
        device_type: incoming.device_type,
        browser: incoming.browser,
        ip_address: incoming.ip_address,
        os: incoming.os,
        last_activity: now,
      };
      user.devices.push(next);

      // keep only last 5 devices (oldest out)
      if (user.devices.length > 5) {
        user.devices = user.devices.slice(-5);
      }
    }

    await this.userRepository.save(user);
    return deviceId;
  }

  async getDeviceInfoFromRequest(req: Request): Promise<Partial<DeviceInfo>> {
    const ua = req.headers['user-agent'] || '';
    const xff = (req.headers['x-forwarded-for'] as string) || '';
    const ip = (xff && xff.split(',')[0].trim()) || (req.socket && (req.socket as any).remoteAddress) || (req.connection && (req.connection as any).remoteAddress) || (req as any).ip || 'unknown';

    return {
      device_type: this.getDeviceType(ua),
      browser: this.getBrowser(ua),
      ip_address: ip,
      os: this.getOS(ua),
    };
  }

  private getDeviceType(ua: string): string {
    if (/mobile/i.test(ua)) return 'mobile';
    if (/tablet/i.test(ua)) return 'tablet';
    return 'desktop';
  }
  private getBrowser(ua: string): string {
    if (/edg/i.test(ua)) return 'Edge';
    if (/chrome/i.test(ua)) return 'Chrome';
    if (/firefox/i.test(ua)) return 'Firefox';
    if (/safari/i.test(ua)) return 'Safari';
    return 'Unknown';
  }
  private getOS(ua: string): string {
    if (/windows/i.test(ua)) return 'Windows';
    if (/macintosh|mac os x/i.test(ua)) return 'macOS';
    if (/linux/i.test(ua)) return 'Linux';
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    return 'Unknown';
  }
}
