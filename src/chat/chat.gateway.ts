import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, Message, User, Order, Service } from 'entities/global.entity';
import { instanceToPlain } from 'class-transformer';

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
  ) { }

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

  emitNewMessage(otherUserId: string, message: any, sender: any) {
    const cleanMessage = instanceToPlain(message, { enableCircularCheck: true });
    console.log(`User ${sender.username} send message to ${otherUserId}`);
    this.server
      .to(`user_${otherUserId}`)
      .emit('new_message', {
        ...cleanMessage,
        sender,
      });
  }

  emitNewNotification(userId: string, notification: any) {
    this.server.to(`user_${userId}`).emit("new_notification", notification);
    console.log("📢 Sent notification to user:", userId);
  }

}
