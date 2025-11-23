import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Category, Service, CategoryType } from 'entities/global.entity';
import { join } from 'path';
import { promises as fsp } from 'fs';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    @InjectRepository(Service)
    public serviceRepository: any,
  ) { }


  async getCategory(id: string) {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['services'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async createCategory(createCategoryDto: any) {
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  async updateCategory(id: string, updateCategoryDto: any) {
    const category = await this.getCategory(id);
    Object.assign(category, updateCategoryDto);
    return this.categoryRepository.save(category);
  }

  async deleteCategory(id: string) {
    const category = await this.getCategory(id);
    return this.categoryRepository.remove(category);
  }

  async getCategoryServices(slug: string, page: number = 1) {
    const pageNum = Number(page) || 1;
    const limit = 20;
    const skip = (pageNum - 1) * limit;

    const category = await this.categoryRepository.findOne({
      where: { slug },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    const [services, total] = await this.serviceRepository.findAndCount({
      where: { categoryId: category.id },
      relations: ['seller', 'category'],
      order: { ordersCount: 'DESC' },
      skip,
      take: limit,
    });

    return {
      category,
      services,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }


  async getPopularCategories(limit: number = 10) {
    return this.categoryRepository
      .createQueryBuilder('category')
      .leftJoin('category.services', 'service')
      .select(['category.id', 'category.name', 'category.slug', 'category.image'])
      .addSelect('COUNT(service.id)', 'serviceCount')
      .groupBy('category.id')
      .orderBy('serviceCount', 'DESC')
      .limit(limit)
      .getRawMany();
  }


  async markAsTop(categoryId: string, iconUrl: string) {
    const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    // limit max top categories
    const count = await this.categoryRepository.count({ where: { top: true } });
    if (count >= 10) {
      throw new BadRequestException('Maximum 10 top categories allowed.');
    }

    category.top = true;
    category.topIconUrl = iconUrl;

    return this.categoryRepository.save(category);
  }

  async updateTopIcon(id: string, iconUrl: string) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (!category.top) throw new NotFoundException('Category is not marked as top');

    category.topIconUrl = iconUrl;
    await this.categoryRepository.save(category);

    return { message: 'Top category icon updated', iconUrl };
  }

  async unmarkAsTop(categoryId: string) {
    const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    // delete old icon if exists
    if (category.topIconUrl) {
      const oldPath = join(process.cwd(), category.topIconUrl);
      try {
        await fsp.unlink(oldPath);
      } catch (err) {
        if ((err as any).code !== 'ENOENT') {
          console.error('Failed to delete old icon:', err);
        }
      }
    }

    category.top = false;
    category.topIconUrl = null;

    return this.categoryRepository.save(category);
  }

  async getTopCategories(limit = 4) {
    return this.categoryRepository.find({
      where: { top: true },
      take: limit,
      order: { name: 'ASC' }, // or other ordering logic
    });
  }
}