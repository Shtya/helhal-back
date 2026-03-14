import { forwardRef, Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, NotificationSetting, Person, User } from 'entities/global.entity';
import { ConversationsModule } from 'src/conversations/conversations.module';
import { MailModule } from 'common/mailModule';
import { NotificationSubscriber } from './NotificationSubscriber';

@Global()
@Module({
  imports: [
    MailModule,
    TypeOrmModule.forFeature([Notification, NotificationSetting, User, Person]), forwardRef(() => ConversationsModule)],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationSubscriber],
  exports: [NotificationService],
})
export class NotificationModule { }
