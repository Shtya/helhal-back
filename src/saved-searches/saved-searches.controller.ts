import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { SavedSearchesService } from './saved-searches.service';

@Controller('saved-searches')
@UseGuards(JwtAuthGuard)
export class SavedSearchesController {
  constructor(private savedSearchesService: SavedSearchesService) {}

  @Get()
  async getSavedSearches(@Req() req) {
    return this.savedSearchesService.getUserSavedSearches(req.user.id);
  }

  @Get(':id')
  async getSavedSearch(@Req() req, @Param('id') id: string) {
    return this.savedSearchesService.getSavedSearch(req.user.id, id);
  }

  @Post()
  async createSavedSearch(@Req() req, @Body() createSavedSearchDto: any) {
    return this.savedSearchesService.createSavedSearch(req.user.id, createSavedSearchDto);
  }

  @Put(':id')
  async updateSavedSearch(@Req() req, @Param('id') id: string, @Body() updateSavedSearchDto: any) {
    return this.savedSearchesService.updateSavedSearch(req.user.id, id, updateSavedSearchDto);
  }

  @Delete(':id')
  async deleteSavedSearch(@Req() req, @Param('id') id: string) {
    return this.savedSearchesService.deleteSavedSearch(req.user.id, id);
  }

  @Get(':id/notifications')
  async getSearchNotifications(@Req() req, @Param('id') id: string, @Query('page') page: number = 1) {
    return this.savedSearchesService.getSearchNotifications(req.user.id, id, page);
  }

  @Post('check-new')
  async checkForNewServices(@Req() req) {
    return this.savedSearchesService.checkForNewServices(req.user.id);
  }
}