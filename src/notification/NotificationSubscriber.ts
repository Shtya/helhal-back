import { Injectable, OnModuleInit } from "@nestjs/common";
import { MailService } from "common/nodemailer";
import { Notification, User } from "entities/global.entity";
import { ChatGateway } from "src/chat/chat.gateway";
import {
    EntitySubscriberInterface,
    InsertEvent,
    DataSource,
    EntityManager,
} from "typeorm";
import { geNotificationtLink } from "utils/url";

@Injectable()
export class NotificationSubscriber
    implements EntitySubscriberInterface<Notification>, OnModuleInit {
    constructor(
        private readonly dataSource: DataSource,
        private readonly chatGateway: ChatGateway,
        private readonly mailService: MailService,
    ) { }

    // Tell TypeORM which entity we listen to
    listenTo(): Function {
        return Notification;
    }

    // This will be called by TypeORM when a Notification is inserted
    async afterInsert(event: InsertEvent<Notification>) {
        const notif = event.entity;
        if (!notif || !notif.userId) return;

        try {
            this.chatGateway.emitNewNotification(notif.userId, notif);
        } catch (err) {
            // log but don't crash DB operation
            console.error('NotificationSubscriber emit error', err);
        }

        try {
            await this.handleEmailNotification(notif, event.manager);
        } catch (err) {
            console.error('Email notification error', err);
        }
    }

    private async handleEmailNotification(notif: Notification, manager: EntityManager) {
        // جلب المستخدم مع إعدادات الإشعارات الخاصة به
        const user = await manager.findOne(User, {
            where: { id: notif.userId },
            relations: ['notificationSettings', 'person']
        });

        if (!user || !user.email) return;

        const userSettings = user.notificationSettings?.settings;

        const typeMapping: Record<string, string> = {
            'user': 'messages', // أو Others حسب منطق عملك
            'service': 'services',
            'proposal': 'proposals',
            'transaction': 'transactions',
            'dispute': 'disputes',
            'order': 'orders',
            'job': 'jobs'
        };

        const settingKey = typeMapping[notif.relatedEntityType] || 'others';
        const isEmailEnabled = userSettings ? userSettings[settingKey] : true;

        if (isEmailEnabled) {
            // الحصول على الرابط باستخدام الدالة المذكورة
            // ملاحظة: قد تحتاج لتمرير دور المستخدم إذا كان متوفراً في كائن المستخدم
            const link = geNotificationtLink(
                notif.relatedEntityType,
                notif.relatedEntityId,
                notif.type,
                user.role
            );

            await this.mailService.sendNotificationEmail(
                user.email,
                user.username || 'User',
                notif,
                user?.preferredLanguage,
                link
            );

        }
    }

    // Register this instance with TypeORM's DataSource so it actually receives events
    onModuleInit() {
        // Avoid double-registering
        const alreadyRegistered = this.dataSource.subscribers.some(
            (s) => (s as any).constructor === this.constructor,
        );
        if (!alreadyRegistered) {
            this.dataSource.subscribers.push(this as any);
        }
    }
}
