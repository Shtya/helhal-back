import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationSetting, User } from 'entities/global.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    public notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationSetting)
    public notificationSettingRepository: Repository<NotificationSetting>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
  ) {}

  async getUserNotificationSettings(userId: string) {
    let settings = await this.notificationSettingRepository.findOne({ where: { userId } });

    if (!settings) {
      // Create default notification settings
      settings = this.notificationSettingRepository.create({
        userId,
        settings: {
          email: {
            inboxMessages: true,
            orderMessages: true,
            serviceUpdates: true,
            quoteOrderUpdates: true,
            ratingReminders: true,
            adminNotifications: true,
          },
          mobile: {
            inboxMessages: false,
            orderMessages: false,
            serviceUpdates: false,
            quoteOrderUpdates: false,
            ratingReminders: false,
            adminNotifications: false,
          },
          push: {
            enabled: true,
            sound: true,
          },
        },
      });
      await this.notificationSettingRepository.save(settings);
    }

    return settings;
  }

  async updateUserNotificationSettings(userId: string, newSettings: any) {
    let settings = await this.notificationSettingRepository.findOne({ where: { userId } });

    if (!settings) {
      settings = this.notificationSettingRepository.create({
        userId,
        settings: newSettings,
      });
    } else {
      settings.settings = { ...settings.settings, ...newSettings };
    }

    return this.notificationSettingRepository.save(settings);
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (notification) {
      notification.isRead = true;
      await this.notificationRepository.save(notification);
    }

    return notification;
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepository.createQueryBuilder().update(Notification).set({ isRead: true }).where('userId = :userId', { userId }).andWhere('isRead = :isRead', { isRead: false }).execute();

    return { message: 'All notifications marked as read' };
  }

  async getNotificationSettings(userId: string) {
    let settings = await this.notificationSettingRepository.findOne({ where: { userId } });

    if (!settings) {
      // Default notification settings
      settings = this.notificationSettingRepository.create({
        userId,
        settings: {
          email: {
            orderMessages: true,
            serviceUpdates: true,
            promotions: false,
            adminNotifications: true,
          },
          push: {
            orderMessages: true,
            serviceUpdates: true,
            promotions: false,
            adminNotifications: true,
          },
          sms: {
            orderMessages: false,
            serviceUpdates: false,
            promotions: false,
            adminNotifications: false,
          },
        },
      });
      await this.notificationSettingRepository.save(settings);
    }

    return settings;
  }

  async updateNotificationSettings(userId: string, newSettings: any) {
    const settings = await this.getNotificationSettings(userId);
    settings.settings = { ...settings.settings, ...newSettings };
    return this.notificationSettingRepository.save(settings);
  }

  async createNotification(userId: string, type: string, title: string, message: string, relatedEntityType?: string, relatedEntityId?: string) {
    const notification = this.notificationRepository.create({
      userId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
      isRead: false,
    });

    return this.notificationRepository.save(notification);
  }

  async sendBulkNotification(userIds: string[], type: string, title: string, message: string) {
    const notifications = userIds.map(userId =>
      this.notificationRepository.create({
        userId,
        type,
        title,
        message,
        isRead: false,
      }),
    );

    return this.notificationRepository.save(notifications);
  }
}
