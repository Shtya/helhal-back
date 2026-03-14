import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Language, Notification, NotificationSetting, Person, User } from 'entities/global.entity';
import { NotificationCategoriesDto } from 'dto/notifications.dto';
import { TranslationService } from 'common/translation.service';
import { Path } from 'nestjs-i18n';
import { I18nTranslations } from 'src/generated/i18n.generated';



@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    public notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationSetting)
    public notificationSettingRepository: Repository<NotificationSetting>,
    @InjectRepository(User) public userRepository: Repository<User>,
    @InjectRepository(Person) public personRepository: Repository<Person>,
    private readonly i18n: TranslationService,
  ) { }

  async getAdminNotifications(_requesterId: string, query: any) {
    // (Optional) still restrict the endpoint to admins:
    const requester = await this.userRepository.findOne({ where: { id: _requesterId } });
    if (!requester || requester.role !== 'admin') throw new ForbiddenException(this.i18n.t('events.notifications.admins_only'));

    // Pick the FIRST admin and use THEIR id to fetch notifications
    const adminUser = await this.userRepository.findOne({
      where: { role: 'admin' },
      order: { created_at: 'ASC' }, // use entity prop, not created_at
      select: ['id'],
    });
    if (!adminUser) throw new NotFoundException(this.i18n.t('events.notifications.no_admin_found'));

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
    if (!me || me.role !== 'admin') throw new ForbiddenException(this.i18n.t('events.notifications.admins_only'));

    // pick the FIRST admin and count THEIR notifications
    const adminUser = await this.userRepository.findOne({
      where: { role: 'admin' },
      order: { created_at: 'ASC' }, // entity prop, not created_at
      select: ['id'],
    });
    if (!adminUser) throw new NotFoundException(this.i18n.t('events.notifications.no_admin_found'));

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

    const newLang = newSettings.language;
    if (Object.values(Language).includes(newLang)) {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['person'],
        select: {
          id: true,
          personId: true,
          person: {
            id: true, // Required for TypeORM to know which person to update
            preferredLanguage: true
          }
        }
      });
      if (user?.personId) {
        await this.personRepository.update(
          { id: user.personId },
          { preferredLanguage: newLang }
        );
      }
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

    return { message: this.i18n.t('events.notifications.all_read') };
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
    const newLang = newSettings.language;
    if (Object.values(Language).includes(newLang)) {
      await this.userRepository.update(
        { id: userId },
        {
          person: {
            preferredLanguage: newSettings.language
          }
        }
      );
    }

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


  async notifyWithLang({
    userIds,
    type,
    title,
    message,
    relatedEntityId,
    relatedEntityType = 'order',
    manager
  }: {
    userIds: string[];
    type: string;
    title: { key: Path<I18nTranslations>; args?: Record<string, any> } | string;
    message: { key: Path<I18nTranslations>; args?: Record<string, any> } | string;
    relatedEntityId: string;
    relatedEntityType?: string;
    manager?: EntityManager
  }) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    const users = await repo.createQueryBuilder('user')
      .leftJoin('user.person', 'person')
      .where('user.id IN (:...ids)', { ids: userIds.map(id => id.trim()) })
      .select(['user.id', 'person.preferredLanguage'])
      .getMany();


    const notifications = users.map(user => {
      const lang = user.person?.preferredLanguage || 'ar';

      const data = {
        userId: user.id,
        type,
        title: typeof title === 'string'
          ? title
          : this.i18n.t(title.key, { lang, args: title.args }),
        message: typeof message === 'string'
          ? message
          : this.i18n.t(message.key, { lang, args: message.args }),
        relatedEntityType,
        relatedEntityId: relatedEntityId.trim(),
      };

      // Create via the appropriate repository
      return manager
        ? manager.getRepository(Notification).create(data)
        : this.notificationRepository.create(data);
    });

    // 3. Bulk Save using the manager if provided
    if (notifications.length > 0) {
      if (manager) {
        await manager.getRepository(Notification).save(notifications);
      } else {
        await this.notificationRepository.save(notifications as any);
      }
    }
  }
}
