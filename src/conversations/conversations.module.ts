import { forwardRef, Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, Message, User, Order, Service, FavoriteConversation } from 'entities/global.entity';
import { ChatGateway } from '../chat/chat.gateway';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message, User, Order, Service, FavoriteConversation]), forwardRef(() => AuthModule),],
  controllers: [ConversationsController],
  providers: [ConversationsService, ChatGateway],
  exports: [ChatGateway],
})
export class ConversationsModule { }