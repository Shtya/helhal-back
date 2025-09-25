import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  async getAdminNotifications(_requesterId: string, query: any) {
    // (Optional) still restrict the endpoint to admins:
    const requester = await this.userRepository.findOne({ where: { id: _requesterId } });
    if (!requester || requester.role !== 'admin') throw new ForbiddenException('Admins only');

    // Pick the FIRST admin and use THEIR id to fetch notifications
    const adminUser = await this.userRepository.findOne({
      where: { role: 'admin' },
      order: { created_at: 'ASC' }, // use entity prop, not created_at
      select: ['id'],
    });
    if (!adminUser) throw new NotFoundException('No admin user found');

    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);

    // Accept snake or camel in query, map to entity props
    const SORT_MAP: Record<string, string> = {
      created_at: 'n.created_at',
      id: 'n.id',
      isRead: 'n.isRead',
      type: 'n.type',
      title: 'n.title',
    };
    const sortBy = SORT_MAP[query.sortBy] ?? 'n.created_at';
    const sortOrder = (query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      // ✅ filter by the FIRST admin's id (not requester)
      .where('n.userId = :adminId', { adminId: adminUser.id });

    // optional filters
    const isReadStr = String(query.isRead ?? '').toLowerCase();
    if (['true', '1'].includes(isReadStr)) qb.andWhere('n.isRead = :isRead', { isRead: true });
    if (['false', '0'].includes(isReadStr)) qb.andWhere('n.isRead = :isRead', { isRead: false });
    if (query.type) qb.andWhere('n.type = :type', { type: query.type });

    const [data, total] = await qb
      .orderBy(sortBy, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, sortBy, sortOrder, adminId: adminUser.id } };
  }

  async getAdminUnreadCount(requesterId: string) {
    // keep this guard so only admins can see the admin feed
    const me = await this.userRepository.findOne({ where: { id: requesterId } });
    if (!me || me.role !== 'admin') throw new ForbiddenException('Admins only');

    // pick the FIRST admin and count THEIR notifications
    const adminUser = await this.userRepository.findOne({
      where: { role: 'admin' },
      order: { created_at: 'ASC' }, // entity prop, not created_at
      select: ['id'],
    });
    if (!adminUser) throw new NotFoundException('No admin user found');

    const count = await this.notificationRepository
      .createQueryBuilder('n')
      .where('n.userId = :adminId', { adminId: adminUser.id }) // entity prop
      .andWhere('n.isRead = :isRead', { isRead: false }) // entity prop
      .getCount();

    return { unread: count };
  }

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
