import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, Message, User, Order, Service, FavoriteConversation } from 'entities/global.entity';
import { ChatGateway } from '../chat/chat.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message, User, Order, Service , FavoriteConversation])],
  controllers: [ConversationsController],
  providers: [ConversationsService, ChatGateway],
  exports: [ChatGateway],
})
export class ConversationsModule {}