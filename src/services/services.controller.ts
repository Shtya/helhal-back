import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AccessGuard } from '../auth/guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { ServicesService } from './services.service';
import { CRUD } from 'common/crud.service';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { serviceIconOptions } from 'common/upload.config';
import { Permissions } from 'entities/permissions';

@Controller('services')
export class ServicesController {
  constructor(private servicesService: ServicesService) { }

  @Get('/admin')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'services',
      value: Permissions.Services.View
    }
  })
  async getServicesAdmin(@Query('') query: any) {
    return CRUD.findAll(this.servicesService.serviceRepository, 'service', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['seller', 'category'], ['title'], { status: query.status == 'all' ? '' : query.status });
  }

  @Get()
  async getServices(@Query() query: any) {
    return this.servicesService.getServices(query);
  }

  @UseGuards(JwtAuthGuard, AccessGuard)
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
    return this.servicesService.getCategoryServices(null, query);
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
  async getGlobalFilterOptions() {
    return this.servicesService.getAllFilterOptions();
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  async getService(@Param('slug') slug: string, @Req() req) {
    return this.servicesService.getService(slug, req.user?.id, req);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.SELLER, UserRole.ADMIN], permission: {
      domain: 'services',
      value: Permissions.Services.Add
    }
  })
  async createService(@Req() req, @Body() createServiceDto: any) {
    return this.servicesService.createService(req.user.id, createServiceDto);
  }

  // @Put(':id')
  // @UseGuards(JwtAuthGuard, AccessGuard)
  // @RequireAccess(UserRole.SELLER, UserRole.ADMIN)
  // async updateService(@Req() req, @Param('id') id: string, @Body() updateServiceDto: any) {
  //   return this.servicesService.updateService(req.user.id, id, updateServiceDto, req);
  // }


  @Put(':id/status')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'services',
      value: Permissions.Services.ChangeStatus
    }
  })
  async updateServiceStatus(
    @Param('id') id: string,
    @Body() body: { status },
  ) {
    return this.servicesService.updateServiceStatus(id, body.status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.SELLER, UserRole.ADMIN], permission: {
      domain: 'services',
      value: Permissions.Services.Delete
    }
  })
  async deleteService(@Req() req, @Param('id') id: string) {
    return this.servicesService.deleteService(req.user.id, id);
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.SELLER, UserRole.ADMIN], permission: {
      domain: 'services',
      value: Permissions.Services.View
    }
  })
  async getServiceAnalytics(@Req() req, @Param('id') id: string) {
    return this.servicesService.getServiceAnalytics(req.user.id, id);
  }

  @Post(':id/impression')
  async trackImpression(@Param('id') id: string) {
    return this.servicesService.trackImpression(id);
  }

  @Put(':id/click')
  @UseGuards(OptionalJwtAuthGuard)
  async trackClick(@Param('id') id: string, @Req() req) {
    return this.servicesService.trackClick(id, req, req.user?.id);
  }

  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'services',
      value: Permissions.Services.PopularToggle
    }
  })
  @UseInterceptors(FileInterceptor('icon', serviceIconOptions))
  @Post(':id/popular')
  async setPopular(
    @Param('id') id: string,
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Icon file is required to mark as popular');
    }
    const iconUrl = `uploads/service-icons/${file.filename}`;
    return this.servicesService.markAsPopular(id, iconUrl);
  }


  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'services',
      value: Permissions.Services.PopularToggle
    }
  })
  @UseInterceptors(FileInterceptor('icon', serviceIconOptions))
  @Post(':id/popular/icon')
  async updatePopularIcon(
    @Param('id') id: string,
    @UploadedFile() file: any
  ) {

    if (!file) {
      throw new BadRequestException('Icon file is required to update popular icon');
    }


    const iconUrl = `uploads/service-icons/${file.filename}`;
    return this.servicesService.updatePopularIcon(id, iconUrl);
  }


  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'services',
      value: Permissions.Services.PopularToggle
    }
  })
  @Delete(':id/unpopular')
  async unsetPopular(@Param('id') id: string) {
    return this.servicesService.unmarkAsPopular(id);
  }

  @Get('popular/list')
  async getPopular() {
    return this.servicesService.getPopularServices();
  }

  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.SELLER, UserRole.ADMIN], permission: {
      domain: 'services',
      value: [Permissions.Services.Add, Permissions.Services.Edit]
    }
  })
  @Get('check-title/:title')
  async checkTitle(
    @Param('title') title: string,
    @Req() req: any
  ) {
    return this.servicesService.checkServiceTitleUniqueness(
      title,
      req.user?.id
    );
  }

}
