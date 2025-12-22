import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AccessGuard } from '../auth/guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { BlogsService } from './blogs.service';

@Controller('blogs')
export class BlogsController {
  constructor(private blogsService: BlogsService) { }

  @Get()
  async getBlogs(@Query() query: any) {
    return this.blogsService.getBlogs(query);
  }

  @Get('search')
  async searchBlogs(@Query() query: any) {
    return this.blogsService.searchBlogs(query);
  }

  @Get(':id')
  async getBlog(@Param('id') id: string) {
    return this.blogsService.getBlog(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN, UserRole.SELLER] })
  async createBlog(@Req() req, @Body() createBlogDto: any) {
    return this.blogsService.createBlog(req.user.id, createBlogDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN, UserRole.SELLER] })
  async updateBlog(@Req() req, @Param('id') id: string, @Body() updateBlogDto: any) {
    return this.blogsService.updateBlog(req.user.id, id, updateBlogDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN, UserRole.SELLER] })
  async deleteBlog(@Req() req, @Param('id') id: string) {
    return this.blogsService.deleteBlog(req.user.id, id);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN, UserRole.SELLER] })
  async publishBlog(@Req() req, @Param('id') id: string) {
    return this.blogsService.publishBlog(req.user.id, id);
  }

  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN, UserRole.SELLER] })
  async unpublishBlog(@Req() req, @Param('id') id: string) {
    return this.blogsService.unpublishBlog(req.user.id, id);
  }

  @Get(':id/comments')
  async getBlogComments(@Param('id') id: string, @Query('page') page: number = 1) {
    return this.blogsService.getBlogComments(id, page);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  async addComment(@Req() req, @Param('id') id: string, @Body() body: { comment: string }) {
    return this.blogsService.addComment(req.user.id, id, body.comment);
  }

  @Put('comments/:commentId/status')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN] })
  async updateCommentStatus(@Param('commentId') commentId: string, @Body() body: { status: string }) {
    return this.blogsService.updateCommentStatus(commentId, body.status);
  }

  @Delete('comments/:commentId')
  @UseGuards(JwtAuthGuard)
  async deleteComment(@Req() req, @Param('commentId') commentId: string) {
    return this.blogsService.deleteComment(req.user.id, req.user.role, commentId);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async likeBlog(@Req() req, @Param('id') id: string) {
    return this.blogsService.likeBlog(req.user.id, id);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  async unlikeBlog(@Req() req, @Param('id') id: string) {
    return this.blogsService.unlikeBlog(req.user.id, id);
  }

  @Get('author/:authorId')
  async getAuthorBlogs(@Param('authorId') authorId: string, @Query('page') page: number = 1) {
    return this.blogsService.getAuthorBlogs(authorId, page);
  }

  @Get('category/:categoryId')
  async getCategoryBlogs(@Param('categoryId') categoryId: string, @Query('page') page: number = 1) {
    return this.blogsService.getCategoryBlogs(categoryId, page);
  }
}