import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { CategoriesService } from './categories.service';
import { CRUD } from 'common/crud.service';
import { IsNull, Not } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import { categoryIconOptions } from 'common/upload.config';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) { }

  @Get()
  async getCategories(@Query() query) {
    let parentFilter = {};

    if (query.type === 'subcategory') {
      parentFilter = { parentId: { isNull: false } };  // parentId IS NOT NULL
    } else if (query.type === 'category') {
      parentFilter = { parentId: { isNull: true } };        // parentId IS NULL
    }

    const filters = {
      ...(query.filters || {}),
      ...parentFilter,
    };

    return CRUD.findAll(
      this.categoriesService.categoryRepository,
      'category',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [],
      ['name'],
      filters
    );
  }

  @Get(':id')
  async getCategory(@Param('id') id: string) {
    return this.categoriesService.getCategory(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(UserRole.ADMIN)
  async createCategory(@Body() createCategoryDto: any) {
    return this.categoriesService.createCategory(createCategoryDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateCategory(@Param('id') id: string, @Body() updateCategoryDto: any) {
    return this.categoriesService.updateCategory(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteCategory(@Param('id') id: string) {
    return this.categoriesService.deleteCategory(id);
  }

  @Get(':slug/services')
  async getCategoryServices(@Param('slug') slug: string, @Query('page') page: number = 1) {
    return this.categoriesService.getCategoryServices(slug, page);
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('icon', categoryIconOptions))
  @Post(':id/top')
  async setTop(
    @Param('id') id: string,
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Icon file is required to mark as top');
    }
    const iconUrl = `uploads/category-icons/${file.filename}`;
    return this.categoriesService.markAsTop(id, iconUrl);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('icon', categoryIconOptions))
  @Post(':id/top/icon')
  async updateTopIcon(
    @Param('id') id: string,
    @UploadedFile() file: any
  ) {
    if (!file) {
      throw new BadRequestException('Icon file is required to update top category icon');
    }
    const iconUrl = `uploads/category-icons/${file.filename}`;
    return this.categoriesService.updateTopIcon(id, iconUrl);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id/untop')
  async unsetTop(@Param('id') id: string) {
    return this.categoriesService.unmarkAsTop(id);
  }

  @Get('top/list')
  async getTop() {
    return this.categoriesService.getTopCategories();
  }
}