import { Controller, Get, Put, Body, UseGuards, Req, Param, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { CRUD } from 'common/crud.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

 @Get()
  async getNotifications(@Query() query: any, @Req() req: any) {
    return CRUD.findAll(
      this.notificationService.notificationRepository,
      'notification',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [], // relation
      [], // search
      { userId: req.user.id }, 
    );
  }

	@Get('admin')
  async getAdminFeed(@Query() query: any, @Req() req: any) {
    return this.notificationService.getAdminNotifications(req.user.id, query);
  }

  // --- NEW: Admin unread count ---
  @Get('admin/unread-count')
  async getAdminUnreadCount(@Req() req: any) {
    return this.notificationService.getAdminUnreadCount(req.user.id);
  }

  @Get('unread-count')
  async getUnreadCount(@Query() query: any, @Req() req: any) {
    return CRUD.findAll(
      this.notificationService.notificationRepository,
      'notification',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [], // relation
      [], // search
      { userId: req.user.id, isRead: false }, // filter
    );
  }

  @Put('read/:id')
  async markAsRead(@Req() req, @Param('id') notificationId: string) {
    return this.notificationService.markAsRead(req.user.id, notificationId);
  }

  @Put('read-all')
  async markAllAsRead(@Req() req) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

  @Get('settings')
  async getNotificationSettings(@Req() req) {
    return this.notificationService.getNotificationSettings(req.user.id);
  }

  @Put('settings')
  async updateNotificationSettings(@Req() req, @Body() settings: any) {
    return this.notificationService.updateNotificationSettings(req.user.id, settings);
  }

  @UseGuards(JwtAuthGuard)
  @Get('settings/user')
  async getUserNotificationSettings(@Req() req: any) {
    return this.notificationService.getUserNotificationSettings(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('settings/user')
  async updateUserNotificationSettings(@Req() req: any, @Body() settings: any) {
    return this.notificationService.updateUserNotificationSettings(req.user.id, settings);
  }
}
