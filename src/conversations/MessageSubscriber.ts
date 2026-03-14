import { Injectable, OnModuleInit } from "@nestjs/common";
import { MailService } from "common/nodemailer";
import { Conversation, Message, User } from "entities/global.entity";
import { ChatGateway } from "src/chat/chat.gateway";
import { DataSource, EntitySubscriberInterface, InsertEvent } from "typeorm";

@Injectable()
export class MessageSubscriber implements EntitySubscriberInterface<Message>, OnModuleInit {
    constructor(
        private readonly dataSource: DataSource,
        private readonly chatGateway: ChatGateway,
        private readonly mailService: MailService,
    ) { }

    listenTo() {
        return Message;
    }

    async afterInsert(event: InsertEvent<Message>) {
        const message = event.entity;
        if (!message) return;

        const manager = event.manager;

        try {
            // 1. Fetch Conversation to identify the receiver
            const conversation = await manager.findOne(Conversation, {
                where: { id: message.conversationId }
            });

            if (!conversation) return;

            const receiverId = conversation.buyerId === message.senderId
                ? conversation.sellerId
                : conversation.buyerId;

            // 2. Fetch Sender & Receiver details
            const [sender, receiver] = await Promise.all([
                manager.findOne(User, {
                    where: { id: message.senderId },
                    select: { id: true, username: true } // Fetching only required fields
                }),
                manager.findOne(User, {
                    where: { id: receiverId },
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        preferredLanguage: true
                    },
                    relations: ['notificationSettings']
                })
            ]);
            // 3. Emit via WebSocket
            if (receiver) {
                this.chatGateway.emitNewMessage(receiverId, message, sender);
            }

            // 4. Handle Email Notification
            if (receiver?.email) {
                const isEmailEnabled = receiver.notificationSettings?.settings?.messages;

                if (isEmailEnabled) {
                    await this.mailService.sendNewMessageEmail(
                        receiver.email.trim(),
                        sender?.username?.trim() || 'User',
                        sender?.id?.trim(),
                        message.message?.trim() || '',
                        receiver.preferredLanguage || 'en'
                    );
                }
            }
        } catch (err) {
            console.error('MessageSubscriber error:', err);
        }
    }

    onModuleInit() {
        const alreadyRegistered = this.dataSource.subscribers.some(
            (s) => (s as any).constructor === this.constructor,
        );
        if (!alreadyRegistered) {
            this.dataSource.subscribers.push(this as any);
        }
    }
}