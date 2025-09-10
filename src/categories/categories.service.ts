import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Category, Service, CategoryType } from 'entities/global.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    @InjectRepository(Service)
    public serviceRepository: any,
  ) {}

 
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
    where: { categoryId: category.id  },
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
}