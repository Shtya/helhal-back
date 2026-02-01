import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AccessGuard } from '../auth/guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { CategoriesService } from './categories.service';
import { CRUD } from 'common/crud.service';
import { IsNull, Not } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import { categoryIconOptions } from 'common/upload.config';
import { Permissions } from 'entities/permissions';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) { }

  @Get('top')
  async getTopCategories(@Query('limit') limit: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.categoriesService.getTopCategoriesWithSub(parsedLimit);
  }

  @Get()
  async getCategories(@Query() query) {
    const { type, ...restFilters } = query.filters || {};

    let parentFilter;

    if (!type || type === 'subcategory') {
      parentFilter = restFilters.parentId
        ? { parentId: restFilters.parentId }
        : undefined;
    } else if (type === 'category') {
      parentFilter = { parentId: { isNull: true } };
    }

    const filters = {
      ...restFilters,   // 👈 type is removed here
      ...(parentFilter ?? {}),
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
      ['name_en', 'name_ar'],
      filters
    );
  }

  @Get(':id')
  async getCategory(@Param('id') id: string) {
    return this.categoriesService.getCategory(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'categories',
      value: Permissions.Categories.Add
    }
  })
  async createCategory(@Body() createCategoryDto: any) {
    return this.categoriesService.createCategory(createCategoryDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'categories',
      value: Permissions.Categories.Edit
    }
  })
  async updateCategory(@Param('id') id: string, @Body() updateCategoryDto: any) {
    return this.categoriesService.updateCategory(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'categories',
      value: Permissions.Categories.Delete
    }
  })
  async deleteCategory(@Param('id') id: string) {
    return this.categoriesService.deleteCategory(id);
  }

  @Get(':slug/services')
  async getCategoryServices(@Param('slug') slug: string, @Query('page') page: number = 1) {
    return this.categoriesService.getCategoryServices(slug, page);
  }
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'categories',
      value: Permissions.Categories.TopToggle
    }
  })


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

  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'categories',
      value: Permissions.Categories.TopToggle
    }
  })
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

  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'categories',
      value: Permissions.Categories.TopToggle
    }
  })
  @Delete(':id/untop')
  async unsetTop(@Param('id') id: string) {
    return this.categoriesService.unmarkAsTop(id);
  }

  @Get('top/list')
  async getTop() {
    return this.categoriesService.getTopCategories();
  }

  // @UseGuards(JwtAuthGuard, AccessGuard)
  // @RequireAccess({
  //   roles: [UserRole.ADMIN],
  //   permission: {
  //     domain: 'categories',
  //     value: Permissions.Categories.TopToggle
  //   }
  // })
  // @UseInterceptors(FileInterceptor('icon', categoryIconOptions))
  // @Post(':id/freelance-top')
  // async setFreelanceTop(
  //   @Param('id') id: string,
  //   @UploadedFile() file?: any,
  // ) {
  //   if (!file) {
  //     throw new BadRequestException('Icon file is required to mark as freelance top');
  //   }
  //   const iconUrl = `uploads/category-icons/${file.filename}`;
  //   return this.categoriesService.markAsFreelanceTop(id, iconUrl);
  // }

  // @UseGuards(JwtAuthGuard, AccessGuard)
  // @RequireAccess({
  //   roles: [UserRole.ADMIN],
  //   permission: {
  //     domain: 'categories',
  //     value: Permissions.Categories.TopToggle
  //   }
  // })
  // @UseInterceptors(FileInterceptor('icon', categoryIconOptions))
  // @Post(':id/freelance-top/icon')
  // async updateFreelanceTopIcon(
  //   @Param('id') id: string,
  //   @UploadedFile() file: any
  // ) {
  //   if (!file) {
  //     throw new BadRequestException('Icon file is required to update freelance top category icon');
  //   }
  //   const iconUrl = `uploads/category-icons/${file.filename}`;
  //   return this.categoriesService.updateFreelanceTopIcon(id, iconUrl);
  // }

  // @UseGuards(JwtAuthGuard, AccessGuard)
  // @RequireAccess({
  //   roles: [UserRole.ADMIN],
  //   permission: {
  //     domain: 'categories',
  //     value: Permissions.Categories.TopToggle
  //   }
  // })
  // @Delete(':id/freelance-untop')
  // async unsetFreelanceTop(@Param('id') id: string) {
  //   return this.categoriesService.unmarkAsFreelanceTop(id);
  // }

  // @Get('freelance-top/list')
  // async getFreelanceTop() {
  //   return this.categoriesService.getFreelanceTopCategories();
  // }

}