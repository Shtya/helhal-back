import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between, MoreThanOrEqual, LessThanOrEqual, ILike } from 'typeorm';
import { Blog, BlogComment, BlogCategory, User, BlogLike, BlogStatus, CommentStatus, UserRole } from 'entities/global.entity';


@Injectable()
export class BlogsService {
  constructor(
    @InjectRepository(Blog)
    private blogRepository: Repository<Blog>,
    @InjectRepository(BlogComment)
    private blogCommentRepository: Repository<BlogComment>,
    @InjectRepository(BlogCategory)
    private blogCategoryRepository: Repository<BlogCategory>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(BlogLike)
    private blogLikeRepository: Repository<BlogLike>,
  ) {}

  async getBlogs(query: any) {
    const {
      page = 1,
      limit = 12,
      status = 'published',
      category,
      author,
      sortBy = 'publishedAt',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;
    const whereClause: any = { status };

    if (category) {
      whereClause.categories = { id: category };
    }

    if (author) {
      whereClause.authorId = author;
    }

    const [blogs, total]:any = await this.blogRepository.findAndCount({
      where: whereClause,
      relations: ['author', 'categories', 'comments', 'likes'],
      order: { [sortBy]: sortOrder },
      skip,
      take: limit,
    });

    // Enhance blogs with additional data
    const enhancedBlogs = blogs.map(blog => ({
      ...blog,
      commentCount: blog.comments?.filter(comment => comment.status === CommentStatus.APPROVED).length || 0,
      likeCount: blog.likes?.length || 0,
    }));

    return {
      blogs: enhancedBlogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async searchBlogs(query: any) {
    const { q, page = 1, limit = 12 } = query;
    const skip = (page - 1) * limit;

    const [blogs, total] = await this.blogRepository.findAndCount({
      where: [
        { title: ILike(`%${q}%`), status: BlogStatus.PUBLISHED },
        { content: ILike(`%${q}%`), status: BlogStatus.PUBLISHED },
        { excerpt: ILike(`%${q}%`), status: BlogStatus.PUBLISHED },
        { tags: In([q]), status: BlogStatus.PUBLISHED },
      ],
      relations: ['author', 'categories'],
      order: { publishedAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      blogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getBlog(blogId: string) {
    const blog:any = await this.blogRepository.findOne({
      where: { id: blogId },
      relations: ['author', 'categories', 'comments', 'comments.user', 'likes', 'likes.user'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Only show approved comments
    blog.comments = blog.comments.filter(comment => comment.status === CommentStatus.APPROVED);

    // Increment view count
    blog.views += 1;
    await this.blogRepository.save(blog);

    return {
      ...blog,
      commentCount: blog.comments.length,
      likeCount: blog.likes.length,
    };
  }

  async createBlog(userId: string, createBlogDto: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { categoryIds, ...blogData } = createBlogDto;

    const blog:any = this.blogRepository.create({
      ...blogData,
      authorId: userId,
      status: BlogStatus.DRAFT,
    });

    // Add categories if provided
    if (categoryIds && categoryIds.length > 0) {
      const categories = await this.blogCategoryRepository.findByIds(categoryIds);
      blog.categories = categories;
    }

    const savedBlog = await this.blogRepository.save(blog);

    return savedBlog;
  }

  async updateBlog(userId: string, blogId: string, updateBlogDto: any) {
    const blog:any = await this.blogRepository.findOne({
      where: { id: blogId },
      relations: ['author'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Check if user is the author or admin
    if (blog.authorId !== userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('You can only update your own blogs');
      }
    }

    const { categoryIds, ...blogData } = updateBlogDto;

    Object.assign(blog, blogData);

    // Update categories if provided
    if (categoryIds) {
      const categories = await this.blogCategoryRepository.findByIds(categoryIds);
      blog.categories = categories;
    }

    return this.blogRepository.save(blog);
  }

  async deleteBlog(userId: string, blogId: string) {
    const blog = await this.blogRepository.findOne({
      where: { id: blogId },
      relations: ['author'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Check if user is the author or admin
    if (blog.authorId !== userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('You can only delete your own blogs');
      }
    }

    return this.blogRepository.remove(blog);
  }

  async publishBlog(userId: string, blogId: string) {
    const blog = await this.blogRepository.findOne({
      where: { id: blogId },
      relations: ['author'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Check if user is the author or admin
    if (blog.authorId !== userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('You can only publish your own blogs');
      }
    }

    blog.status = BlogStatus.PUBLISHED;
    blog.publishedAt = new Date();

    return this.blogRepository.save(blog);
  }

  async unpublishBlog(userId: string, blogId: string) {
    const blog = await this.blogRepository.findOne({
      where: { id: blogId },
      relations: ['author'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Check if user is the author or admin
    if (blog.authorId !== userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('You can only unpublish your own blogs');
      }
    }

    blog.status = BlogStatus.DRAFT;
    blog.publishedAt = null;

    return this.blogRepository.save(blog);
  }

  async getBlogComments(blogId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const [comments, total] = await this.blogCommentRepository.findAndCount({
      where: { 
        blogId, 
        status: CommentStatus.APPROVED 
      },
      relations: ['user'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async addComment(userId: string, blogId: string, commentText: string) {
    const blog = await this.blogRepository.findOne({ where: { id: blogId } });
    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const comment = this.blogCommentRepository.create({
      blogId,
      userId,
      comment: commentText,
      status: CommentStatus.PENDING, // Comments need approval by default
    });

    const savedComment = await this.blogCommentRepository.save(comment);

    // Notify blog author about new comment (if not the author themselves)
    if (blog.authorId !== userId) {
      // This would typically be handled by a notification service
      console.log(`New comment awaiting approval on blog: ${blog.title}`);
    }

    return savedComment;
  }

  async updateCommentStatus(commentId: string, status: string) {
    const comment = await this.blogCommentRepository.findOne({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    comment.status = status as CommentStatus;
    return this.blogCommentRepository.save(comment);
  }

  async deleteComment(userId: string, userRole: string, commentId: string) {
    const comment = await this.blogCommentRepository.findOne({
      where: { id: commentId },
      relations: ['user', 'blog'],
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Check if user is the comment author, blog author, or admin
    const isCommentAuthor = comment.userId === userId;
    const isBlogAuthor = comment.blog.authorId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isCommentAuthor && !isBlogAuthor && !isAdmin) {
      throw new ForbiddenException('You can only delete your own comments or comments on your blog');
    }

    return this.blogCommentRepository.remove(comment);
  }

  async likeBlog(userId: string, blogId: string) {
    const blog:any = await this.blogRepository.findOne({ where: { id: blogId } });
    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Check if user already liked this blog
    const existingLike = await this.blogLikeRepository.findOne({
      where: { userId, blogId },
    });

    if (existingLike) {
      throw new BadRequestException('You have already liked this blog');
    }

    const like = this.blogLikeRepository.create({
      userId,
      blogId,
    });

    const savedLike = await this.blogLikeRepository.save(like);

    // Update blog like count
    blog.likes = await this.blogLikeRepository.find({ where: { blogId } });
    await this.blogRepository.save(blog);

    return savedLike;
  }

  async unlikeBlog(userId: string, blogId: string) {
    const like = await this.blogLikeRepository.findOne({
      where: { userId, blogId },
    });

    if (!like) {
      throw new NotFoundException('Like not found');
    }

    await this.blogLikeRepository.remove(like);

    // Update blog like count
    const blog:any = await this.blogRepository.findOne({ where: { id: blogId } });
    if (blog) {
      blog.likes = await this.blogLikeRepository.find({ where: { blogId } });
      await this.blogRepository.save(blog);
    }

    return { message: 'Blog unliked successfully' };
  }

  async getAuthorBlogs(authorId: string, page: number = 1) {
    const limit = 12;
    const skip = (page - 1) * limit;

    const author = await this.userRepository.findOne({ where: { id: authorId } });
    if (!author) {
      throw new NotFoundException('Author not found');
    }

    const [blogs, total] = await this.blogRepository.findAndCount({
      where: { 
        authorId, 
        status: BlogStatus.PUBLISHED 
      },
      relations: ['categories', 'comments', 'likes'],
      order: { publishedAt: 'DESC' },
      skip,
      take: limit,
    });

    const enhancedBlogs = blogs.map(blog => ({
      ...blog,
      commentCount: blog.comments?.filter(comment => comment.status === CommentStatus.APPROVED).length || 0,
      likeCount: blog.likes?.length || 0,
    }));

    return {
      author,
      blogs: enhancedBlogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getCategoryBlogs(categoryId: string, page: number = 1) {
    const limit = 12;
    const skip = (page - 1) * limit;

    const category = await this.blogCategoryRepository.findOne({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const [blogs, total] = await this.blogRepository.findAndCount({
      where: { 
        categories: { id: categoryId },
        status: BlogStatus.PUBLISHED 
      },
      relations: ['author', 'categories', 'comments', 'likes'],
      order: { publishedAt: 'DESC' },
      skip,
      take: limit,
    }as any);

    const enhancedBlogs = blogs.map(blog => ({
      ...blog,
      commentCount: blog.comments?.filter(comment => comment.status === CommentStatus.APPROVED).length || 0,
      likeCount: blog.likes?.length || 0,
    }));

    return {
      category,
      blogs: enhancedBlogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getPopularBlogs(limit: number = 5) {
    return this.blogRepository.find({
      where: { status: BlogStatus.PUBLISHED },
      relations: ['author', 'categories'],
      order: { views: 'DESC', likes: 'DESC' },
      take: limit,
    });
  }

  async getRecentBlogs(limit: number = 5) {
    return this.blogRepository.find({
      where: { status: BlogStatus.PUBLISHED },
      relations: ['author', 'categories'],
      order: { publishedAt: 'DESC' },
      take: limit,
    });
  }

  async getBlogStats(blogId: string) {
    const blog = await this.blogRepository.findOne({
      where: { id: blogId },
      relations: ['comments', 'likes'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    const approvedComments = blog.comments.filter(comment => comment.status === CommentStatus.APPROVED);
    const pendingComments = blog.comments.filter(comment => comment.status === CommentStatus.PENDING);
    const rejectedComments = blog.comments.filter(comment => comment.status === CommentStatus.REJECTED);

    return {
      views: blog.views,
      likes: blog.likes.length,
      comments: {
        total: blog.comments.length,
        approved: approvedComments.length,
        pending: pendingComments.length,
        rejected: rejectedComments.length,
      },
    };
  }
}