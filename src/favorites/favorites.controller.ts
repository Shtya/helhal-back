import { Controller, Get, Post, Delete, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private favoritesService: FavoritesService) {}

  @Get()
  async getFavorites(@Req() req, @Query('page') page: number = 1) {
    return this.favoritesService.getUserFavorites(req.user.id, page);
  }

  @Post('service/:serviceId')
  async addToFavorites(@Req() req, @Param('serviceId') serviceId: string) {
    return this.favoritesService.addToFavorites(req.user.id, serviceId);
  }

  @Delete('service/:serviceId')
  async removeFromFavorites(@Req() req, @Param('serviceId') serviceId: string) {
    return this.favoritesService.removeFromFavorites(req.user.id, serviceId);
  }

  @Get('check/:serviceId')
  async checkFavorite(@Req() req, @Param('serviceId') serviceId: string) {
    return this.favoritesService.checkFavorite(req.user.id, serviceId);
  }
}