import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, Message, User, Order, Service } from 'entities/global.entity';

@WebSocketGateway({
  cors: {
    // origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>();

  constructor(
    private jwtService: JwtService,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        socket.disconnect();
        return;
      }

      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      const user = await this.userRepository.findOne({ where: { id: decoded.id } });
      if (!user) {
        socket.disconnect();
        return;
      }

      this.connectedUsers.set(user.id, socket.id);
      socket.join(`user_${user.id}`);

      console.log(`User ${user.username} connected with socket ID: ${socket.id}`);
    } catch (error) {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    for (const [userId, socketId] of this.connectedUsers.entries()) {
      if (socketId === socket.id) {
        this.connectedUsers.delete(userId);
        break;
      }
    }
  }

  @SubscribeMessage('join_user')
  async handleJoinUser(socket: Socket, userId: string) {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their notification room`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(socket: Socket, conversationId: string) {
    socket.join(`conversation_${conversationId}`);
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(socket: Socket, conversationId: string) {
    socket.leave(`conversation_${conversationId}`);
  }

  @SubscribeMessage('send_message')
  async handleMessage(socket: Socket, data: { conversationId: string; message: string; attachments?: string[] }) {
    try {
      if (!data.message || data.message.trim().length === 0) {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      if (data.message.length > 1000) {
        socket.emit('error', { message: 'Message too long' });
        return;
      }
      const token = socket.handshake.auth.token;
      const decoded = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });

      const user = await this.userRepository.findOne({ where: { id: decoded.id } });
      if (!user) return;
      const conversation = await this.conversationRepository.findOne({ where: { id: data.conversationId }, relations: ['buyer', 'seller'] });
      if (!conversation) return;
      if (conversation.buyerId !== user.id && conversation.sellerId !== user.id) {
        return;
      }
      const message = this.messageRepository.create({
        conversationId: data.conversationId,
        senderId: user.id,
        message: data.message,
      });

      const savedMessage = await this.messageRepository.save(message);

      conversation.lastMessageAt = new Date();
      await this.conversationRepository.save(conversation);

      this.server.to(`conversation_${data.conversationId}`).emit('new_message', {
        ...savedMessage,
        sender: { id: user.id, username: user.username },
      });

      const otherUserId = conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId;
      const otherUserSocketId = this.connectedUsers.get(otherUserId);

      if (otherUserSocketId) {
        this.server.to(otherUserSocketId).emit('message_notification', {
          conversationId: data.conversationId,
          message: data.message,
          sender: user.username,
        });
      }

      this.server.to(`conversation_${data.conversationId}`).emit('new_message', {
        ...savedMessage,
        sender: { id: user.id, username: user.username, profileImage: user.profileImage },
      });

      // ALSO send to user's personal room for guaranteed delivery
      this.server.to(`user_${otherUserId}`).emit('new_message', {
        ...savedMessage,
        sender: { id: user.id, username: user.username, profileImage: user.profileImage },
      });
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(socket: Socket, conversationId: string) {
    try {
      const token = socket.handshake.auth.token;
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      await this.messageRepository.createQueryBuilder().update(Message).set({ readAt: new Date() }).where('conversationId = :conversationId', { conversationId }).andWhere('senderId != :userId', { userId: decoded.id }).andWhere('readAt IS NULL').execute();
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }
}
