import { forwardRef, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, NotificationSetting, User } from 'entities/global.entity';
import { ConversationsModule } from 'src/conversations/conversations.module';
import { MailModule } from 'common/mailModule';
import { NotificationSubscriber } from './NotificationSubscriber';

@Module({
  imports: [
    MailModule,
    TypeOrmModule.forFeature([Notification, NotificationSetting, User]),
    forwardRef(() => ConversationsModule),],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationSubscriber],
})
export class NotificationModule { }
