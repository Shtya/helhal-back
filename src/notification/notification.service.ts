import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationSetting, User } from 'entities/global.entity';
import { NotificationCategoriesDto } from 'dto/notifications.dto';



@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    public notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationSetting)
    public notificationSettingRepository: Repository<NotificationSetting>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
  ) { }

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
    // 1. Try to find existing settings
    let settings = await this.notificationSettingRepository.findOne({ where: { userId } });

    // 2. If no settings exist, create them with your new final categories
    if (!settings) {
      const defaultSettings = {
        messages: true,
        services: true,
        proposals: true,
        transactions: true,
        disputes: true,
        orders: true,
        jobs: true,
        others: true,
      };

      settings = this.notificationSettingRepository.create({
        userId,
        // We apply the new structure to all channels (Email, Mobile/Push)
        settings: {
          ...defaultSettings
        },
      });

      await this.notificationSettingRepository.save(settings);
    }

    return settings;
  }

  async updateUserNotificationSettings(userId: string, newSettings: NotificationCategoriesDto) {
    let settingsRecord = await this.notificationSettingRepository.findOne({ where: { userId } });

    if (!settingsRecord) {
      // Create new record if it doesn't exist
      settingsRecord = this.notificationSettingRepository.create({
        userId,
        settings: newSettings,
      });
    } else {
      // Deep merge to protect existing nested data
      settingsRecord.settings = {
        ...settingsRecord.settings,
        ...newSettings,
      };
    }

    return this.notificationSettingRepository.save(settingsRecord);
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
    // 1. Try to find existing settings
    let settings = await this.notificationSettingRepository.findOne({ where: { userId } });

    // 2. If no settings exist, create the final default structure
    if (!settings) {
      // These are the 8 final categories all set to true
      const defaultCategories = {
        messages: true,
        services: true,
        proposals: true,
        transactions: true,
        disputes: true,
        orders: true,
        jobs: true,
        others: true,
      };

      settings = this.notificationSettingRepository.create({
        userId,
        ...defaultCategories
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
