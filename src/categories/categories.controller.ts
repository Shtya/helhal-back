import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { CategoriesService } from './categories.service';
import { CRUD } from 'common/crud.service';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  async getCategories(@Query() query ) {
		  return CRUD.findAll(this.categoriesService.categoryRepository, 
					'category', 
					query.search, 
					query.page, 
					query.limit, 
					query.sortBy, 
					query.sortOrder, 
					[], 
					['name'], 
					query.filters); 
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
}