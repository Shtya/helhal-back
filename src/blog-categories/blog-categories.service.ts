import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { BlogCategory, Blog, User, BlogStatus } from 'entities/global.entity';

@Injectable()
export class BlogCategoriesService {
  constructor(
    @InjectRepository(BlogCategory)
    private blogCategoryRepository: Repository<BlogCategory>,
    @InjectRepository(Blog)
    private blogRepository: Repository<Blog>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) { }

  async getCategories(withBlogs: boolean = false) {
    const relations = withBlogs ? ['blogs'] : [];

    const categories = await this.blogCategoryRepository.find({
      relations,
      order: { name: 'ASC' },
    });

    if (withBlogs) {
      // Only include published blogs in the count
      return categories.map(category => ({
        ...category,
        blogs: category.blogs.filter(blog => blog.status === BlogStatus.PUBLISHED),
        blogCount: category.blogs.filter(blog => blog.status === BlogStatus.PUBLISHED).length,
      }));
    }

    return categories;
  }

  async getCategory(categoryId: string, withBlogs: boolean = false) {
    const relations = withBlogs ? ['blogs', 'blogs.author'] : [];

    const category = await this.blogCategoryRepository.findOne({
      where: { id: categoryId },
      relations,
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (withBlogs) {
      // Only include published blogs
      category.blogs = category.blogs.filter(blog => blog.status === BlogStatus.PUBLISHED);
    }

    return {
      ...category,
      blogCount: category.blogs ? category.blogs.length : 0,
    };
  }

  async createCategory(createCategoryDto: any) {
    const { name, description, slug } = createCategoryDto;

    // Check if slug already exists
    const existingCategory = await this.blogCategoryRepository.findOne({
      where: { slug: slug || this.generateSlug(name) },
    });

    if (existingCategory) {
      throw new ForbiddenException('Category with this slug already exists');
    }

    const category = this.blogCategoryRepository.create({
      name,
      description,
      slug: slug || this.generateSlug(name),
    });

    return this.blogCategoryRepository.save(category);
  }

  async updateCategory(categoryId: string, updateCategoryDto: any) {
    const category = await this.blogCategoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const { slug } = updateCategoryDto;

    // Check if new slug already exists (excluding current category)
    if (slug && slug !== category.slug) {
      const existingCategory = await this.blogCategoryRepository.findOne({
        where: { slug },
      });

      if (existingCategory) {
        throw new ForbiddenException('Category with this slug already exists');
      }
    }

    Object.assign(category, updateCategoryDto);
    return this.blogCategoryRepository.save(category);
  }

  async deleteCategory(categoryId: string) {
    const category = await this.blogCategoryRepository.findOne({
      where: { id: categoryId },
      relations: ['blogs'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.blogs && category.blogs.length > 0) {
      throw new ForbiddenException('Cannot delete category with associated blogs');
    }

    return this.blogCategoryRepository.remove(category);
  }

  async getCategoryBlogs(categoryId: string, page: number = 1) {
    const limit = 12;
    const skip = (page - 1) * limit;

    const category = await this.blogCategoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const [blogs, total] = await this.blogRepository.findAndCount({
      where: {
        categories: { id: categoryId },
        status: BlogStatus.PUBLISHED
      },
      relations: {
        author: {
          person: true // Author's profile data
        },
        categories: true,
        comments: {
          user: {
            person: true // Profile of the person who commented
          }
        },
        likes: {
          user: {
            person: true // Profile of the person who liked
          }
        }
      },
      order: { publishedAt: 'DESC' },
      skip,
      take: limit,
    });

    const enhancedBlogs = blogs.map(blog => ({
      ...blog,
      commentCount: blog.comments?.filter(comment => comment.status === 'approved').length || 0,
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

  async assignCategoryToBlog(categoryId: string, blogId: string) {
    const category = await this.blogCategoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const blog = await this.blogRepository.findOne({
      where: { id: blogId },
      relations: ['categories'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Check if category is already assigned
    const isAlreadyAssigned = blog.categories.some(cat => cat.id === categoryId);
    if (isAlreadyAssigned) {
      throw new ForbiddenException('Category is already assigned to this blog');
    }

    blog.categories.push(category);
    return this.blogRepository.save(blog);
  }

  async removeCategoryFromBlog(categoryId: string, blogId: string) {
    const blog = await this.blogRepository.findOne({
      where: { id: blogId },
      relations: ['categories'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Check if category is assigned
    const categoryIndex = blog.categories.findIndex(cat => cat.id === categoryId);
    if (categoryIndex === -1) {
      throw new ForbiddenException('Category is not assigned to this blog');
    }

    blog.categories.splice(categoryIndex, 1);
    return this.blogRepository.save(blog);
  }

  async searchCategories(query: string) {
    return this.blogCategoryRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { description: ILike(`%${query}%`) },
      ],
      order: { name: 'ASC' },
    });
  }

  async getPopularCategories(limit: number = 10) {
    const categories = await this.blogCategoryRepository
      .createQueryBuilder('category')
      .leftJoin('category.blogs', 'blog')
      .select(['category.id', 'category.name', 'category.slug', 'category.description'])
      .addSelect('COUNT(blog.id)', 'blogCount')
      .where('blog.status = :status', { status: BlogStatus.PUBLISHED })
      .groupBy('category.id')
      .orderBy('blogCount', 'DESC')
      .limit(limit)
      .getRawMany();

    return categories.map(cat => ({
      id: cat.category_id,
      name: cat.category_name,
      slug: cat.category_slug,
      description: cat.category_description,
      blogCount: parseInt(cat.blogCount),
    }));
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}