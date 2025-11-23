import { Injectable, NotFoundException, ForbiddenException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Like, Repository } from 'typeorm';
import { Conversation, Message, User, Order, Service as ServiceEntity, FavoriteConversation } from 'entities/global.entity';
import { ChatGateway } from 'src/chat/chat.gateway';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(ServiceEntity)
    private serviceRepository: Repository<ServiceEntity>,
    @InjectRepository(FavoriteConversation)
    private favoriteRepository: Repository<FavoriteConversation>,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
  ) { }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['buyer', 'seller', 'service', 'order'],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const unreadCount = await this.messageRepository.count({
      where: {
        conversationId,
        senderId: conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId,
        readAt: IsNull(),
      },
    });

    return {
      ...conversation,
      unreadCount,
    };
  }

  async getConversationMessages(userId: string, conversationId: string, page: number = 1) {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const limit = 50;
    const validPage = Math.max(1, parseInt(page as any) || 1);
    const skip = (validPage - 1) * limit;

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { conversationId },
      relations: ['sender'],
      order: { created_at: 'DESC' as any },
      skip,
      take: limit,
    });

    return {
      messages: messages.reverse(),
      pagination: {
        page: validPage,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create and save a message with optional attachments.
   * At least one of (messageText, attachments) must be present.
   */
  async sendMessage(userId: string, conversationId: string, messageText?: string, attachments?: {
    url: string;
    type: string;
    filename: string;
  }[]) {
    const text = (messageText || '').trim();

    if (!text && (!attachments || attachments.length === 0)) {
      throw new BadRequestException('Message must include text or attachments');
    }

    if (text && text.length > 1000) {
      throw new BadRequestException('Message too long');
    }

    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const message = this.messageRepository.create({
      conversationId,
      senderId: userId,
      message: text || null,
      // Store attachments array (URLs)
      attachments: attachments && attachments.length ? attachments : null,
    });

    conversation.lastMessageAt = new Date();
    await this.conversationRepository.save(conversation);

    // Determine receiver
    const otherUserId =
      conversation.buyerId === userId
        ? conversation.sellerId
        : conversation.buyerId;

    const user = await this.userRepository.findOne({
      where: [{ id: userId }],

    });
    // 🔥 Emit message to receiver
    this.chatGateway.emitNewMessage(otherUserId, message, user);


    return this.messageRepository.save(message);
  }

  async markAsRead(userId: string, conversationId: string) {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // FIX 1: Mark ALL unread messages in this conversation as read
    // (not just from the other user)
    const result = await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({
        readAt: new Date(),
        // If your column name is different, use the correct one:
        // read_at: new Date() // if that's the actual column name
      })
      .where('conversationId = :conversationId', { conversationId })
      .andWhere('senderId != :userId', { userId }) // Messages NOT from current user
      .andWhere('readAt IS NULL') // Only unread messages
      .execute();

    console.log(`Marked ${result.affected} messages as read for conversation ${conversationId}`);

    return {
      message: 'Messages marked as read',
      affected: result.affected,
    };
  }

  // In conversations.service.ts - Add this method
  async getUnreadCount(userId: string) {
    const conversations = await this.conversationRepository.find({
      where: [{ buyerId: userId }, { sellerId: userId }],
    });

    let totalUnread = 0;

    for (const conversation of conversations) {
      const otherUserId = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;

      const unreadCount = await this.messageRepository.count({
        where: {
          conversationId: conversation.id,
          senderId: otherUserId,
          readAt: IsNull(),
        },
      });

      totalUnread += unreadCount;
    }

    return { unreadCount: totalUnread };
  }

  // Add favorite field to conversation responses
  private async addFavoriteInfo(userId: string, conversations: any[]) {
    const favoriteConversations = await this.favoriteRepository.find({
      where: { userId },
    });

    const favoriteMap = new Map();
    favoriteConversations.forEach(fav => {
      favoriteMap.set(fav.conversationId, true);
    });

    return conversations.map(conversation => ({
      ...conversation,
      isFavorite: favoriteMap.has(conversation.id),
    }));
  }

  async getUserConversations(userId: string, page: number = 1) {
    const limit = 20;
    const validPage = Math.max(1, parseInt(page as any) || 1);
    const skip = (validPage - 1) * limit;

    const [conversations, total] = await this.conversationRepository.findAndCount({
      where: [{ buyerId: userId }, { sellerId: userId }],
      relations: ['buyer', 'seller', 'service', 'order'],
      order: { lastMessageAt: 'DESC' as any },
      skip,
      take: limit,
    });

    const conversationsWithUnread = await Promise.all(
      conversations.map(async conversation => {
        const unreadCount = await this.messageRepository.count({
          where: {
            conversationId: conversation.id,
            senderId: conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId,
            readAt: IsNull(),
          },
        });

        return {
          ...conversation,
          unreadCount,
        };
      }),
    );

    const conversationsWithFavorites = await this.addFavoriteInfo(userId, conversationsWithUnread);

    return {
      conversations: conversationsWithFavorites,
      pagination: {
        page: validPage,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // Search users
  async searchUsers(userId: string, query: string) {
    const users = await this.userRepository.find({
      where: [{ username: Like(`%${query}%`) }, { email: Like(`%${query}%`) }],
      take: 20,
      select: ['id', 'username', 'email', 'profileImage', 'memberSince'],
    });

    return users.filter(user => user.id !== userId);
  }

  // Toggle favorite conversation
  async toggleFavorite(userId: string, conversationId: string) {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const existingFavorite = await this.favoriteRepository.findOne({
      where: { userId, conversationId },
    });

    if (existingFavorite) {
      await this.favoriteRepository.remove(existingFavorite);
      return { isFavorite: false };
    } else {
      const favorite = this.favoriteRepository.create({
        userId,
        conversationId,
      });
      await this.favoriteRepository.save(favorite);
      return { isFavorite: true };
    }
  }

  async getFavoriteConversations(userId: string) {
    const favorites = await this.favoriteRepository.find({
      where: { userId },
      relations: ['conversation', 'conversation.buyer', 'conversation.seller'],
    });

    return favorites.map(fav => fav.conversation);
  }

  async createConversation(userId: string, createConversationDto: any) {
    const { otherUserId, serviceId, orderId, initialMessage } = createConversationDto;

    if (userId === otherUserId) {
      throw new BadRequestException('Cannot create conversation with yourself');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    const otherUser = await this.userRepository.findOne({
      where: { id: otherUserId },
    });

    if (!user || !otherUser) {
      throw new NotFoundException('User not found');
    }

    // Check if conversation already exists
    let conversation = await this.conversationRepository.findOne({
      where: [
        { buyerId: userId, sellerId: otherUserId, serviceId, orderId },
        { buyerId: otherUserId, sellerId: userId, serviceId, orderId },
      ],
    });

    if (conversation) {
      if (initialMessage) {
        await this.sendMessage(userId, conversation.id, initialMessage);
      }
      return conversation;
    }

    // Validate service if provided
    if (serviceId) {
      const service = await this.serviceRepository.findOne({
        where: { id: serviceId },
      });
      if (!service) {
        throw new NotFoundException('Service not found');
      }
    }

    // Validate order if provided
    if (orderId) {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: ['buyer', 'seller'],
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.buyerId !== userId && order.sellerId !== userId) {
        throw new ForbiddenException('Access denied');
      }
    }

    conversation = this.conversationRepository.create({
      buyerId: userId,
      sellerId: otherUserId,
      serviceId: serviceId || null,
      orderId: orderId || null,
      lastMessageAt: new Date(),
    });

    const savedConversation = await this.conversationRepository.save(conversation);

    if (initialMessage) {
      await this.sendMessage(userId, savedConversation.id, initialMessage);

    }


    // Return with relations
    return this.conversationRepository.findOne({
      where: { id: savedConversation.id },
      relations: ['buyer', 'seller'],
    });
  }
}
