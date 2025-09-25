import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { ServicesService } from './services.service';
import { CRUD } from 'common/crud.service';

@Controller('services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get('/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getServicesAdmin(@Query('') query: any) {
    return CRUD.findAll(this.servicesService.serviceRepository, 'service', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['seller', 'category'], ['title'], { status: query.status == 'all' ? '' : query.status });
  }

  @Get()
  async getServices(@Query() query: any) {
    return this.servicesService.getServices(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('/me')
  async getMyServices(@Query() query: any, @Req() req: any) {
    return this.servicesService.getMyServices(query, req.user.id);
  }

  @Get('top')
  async getTopServices(@Query() query: any) {
    return this.servicesService.getTopServices(query);
  }

  // services.controller.ts
  @Get('all')
  async getAllServices(@Query() query: any) {
    return this.servicesService.getAllServices(query);
  }

  @Get('category/:category')
  async getCategoryServices(@Param('category') category: string, @Query() query: any) {
    return this.servicesService.getCategoryServices(category, query);
  }

  @Get('category/:categorySlug/filter-options')
  async getFilterOptions(@Param('categorySlug') categorySlug: string, @Query() query: any) {
    return this.servicesService.getCategoryFilterOptions(categorySlug, query);
  }

  @Get('filter-options')
  async getGlobalFilterOptions(@Query() query: any) {
    return this.servicesService.getAllFilterOptions(query);
  }

  @Get(':slug')
  async getService(@Param('slug') slug: string) {
    return this.servicesService.getService(slug);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  async createService(@Req() req, @Body() createServiceDto: any) {
    return this.servicesService.createService(req.user.id, createServiceDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  async updateService(@Req() req, @Param('id') id: string, @Body() updateServiceDto: any) {
    return this.servicesService.updateService(req.user.id, id, updateServiceDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  async deleteService(@Req() req, @Param('id') id: string) {
    return this.servicesService.deleteService(req.user.id, id);
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  async getServiceAnalytics(@Req() req, @Param('id') id: string) {
    return this.servicesService.getServiceAnalytics(req.user.id, id);
  }

  @Post(':id/impression')
  async trackImpression(@Param('id') id: string) {
    return this.servicesService.trackImpression(id);
  }

  @Post(':id/click')
  async trackClick(@Param('id') id: string) {
    return this.servicesService.trackClick(id);
  }
}
