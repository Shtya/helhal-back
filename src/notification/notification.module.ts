import { forwardRef, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, NotificationSetting, User } from 'entities/global.entity';
import { ConversationsModule } from 'src/conversations/conversations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationSetting, User]),
    forwardRef(() => ConversationsModule),],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule { }
