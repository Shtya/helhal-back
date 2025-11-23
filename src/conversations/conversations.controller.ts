import { Controller, Get, Post, Body, Param, UseGuards, Req, Query, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto, SendMessageDto } from 'dto/conversation.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) { }

  @Get()
  async getConversations(@Req() req, @Query('page') page: number = 1) {
    return this.conversationsService.getUserConversations(req.user.id, page);
  }

  @Get(':id')
  async getConversation(@Req() req, @Param('id') id: string) {
    return this.conversationsService.getConversation(req.user.id, id);
  }

  @Get(':id/messages')
  async getConversationMessages(@Req() req, @Param('id') id: string, @Query('page') page: number = 1) {
    return this.conversationsService.getConversationMessages(req.user.id, id, page);
  }

  @Post()
  async createConversation(@Req() req, @Body() createConversationDto: CreateConversationDto) {
    return this.conversationsService.createConversation(req.user.id, createConversationDto);
  }

  @Post(':id/message')
  async sendMessage(@Req() req, @Param('id') id: string, @Body() sendMessageDto: any) {
    return this.conversationsService.sendMessage(req.user.id, id, sendMessageDto.message, sendMessageDto.attachments);
  }

  @Post(':id/read')
  async markAsRead(@Req() req, @Param('id') id: string) {
    return this.conversationsService.markAsRead(req.user.id, id);
  }

  @Get('unread/count')
  async getUnreadCount(@Req() req) {
    return this.conversationsService.getUnreadCount(req.user.id);
  }

  // NEW: Search users endpoint
  @Get('search/users')
  async searchUsers(@Req() req, @Query('query') query: string) {
    if (!query || query.length < 2) {
      throw new BadRequestException('Query must be at least 2 characters long');
    }
    return this.conversationsService.searchUsers(req.user.id, query);
  }

  // NEW: Toggle favorite conversation
  @Post(':id/favorite')
  async toggleFavorite(@Req() req, @Param('id') id: string) {
    return this.conversationsService.toggleFavorite(req.user.id, id);
  }

  // NEW: Get favorite conversations
  @Get('favorites/list')
  async getFavorites(@Req() req) {
    return this.conversationsService.getFavoriteConversations(req.user.id);
  }
}
