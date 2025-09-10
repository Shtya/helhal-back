import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { BlogCategoriesService } from './blog-categories.service';

@Controller('blog-categories')
export class BlogCategoriesController {
  constructor(private blogCategoriesService: BlogCategoriesService) {}

  @Get()
  async getCategories(@Query('withBlogs') withBlogs: boolean = false) {
    return this.blogCategoriesService.getCategories(withBlogs);
  }

  @Get(':id')
  async getCategory(@Param('id') id: string, @Query('withBlogs') withBlogs: boolean = false) {
    return this.blogCategoriesService.getCategory(id, withBlogs);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createCategory(@Body() createCategoryDto: any) {
    return this.blogCategoriesService.createCategory(createCategoryDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateCategory(@Param('id') id: string, @Body() updateCategoryDto: any) {
    return this.blogCategoriesService.updateCategory(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteCategory(@Param('id') id: string) {
    return this.blogCategoriesService.deleteCategory(id);
  }

  @Get(':id/blogs')
  async getCategoryBlogs(@Param('id') id: string, @Query('page') page: number = 1) {
    return this.blogCategoriesService.getCategoryBlogs(id, page);
  }

  @Post(':id/assign-to-blog/:blogId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  async assignCategoryToBlog(@Param('id') categoryId: string, @Param('blogId') blogId: string) {
    return this.blogCategoriesService.assignCategoryToBlog(categoryId, blogId);
  }

  @Delete(':id/remove-from-blog/:blogId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  async removeCategoryFromBlog(@Param('id') categoryId: string, @Param('blogId') blogId: string) {
    return this.blogCategoriesService.removeCategoryFromBlog(categoryId, blogId);
  }
}