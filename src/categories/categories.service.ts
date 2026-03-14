import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Category, Service, CategoryType } from 'entities/global.entity';
import { join } from 'path';
import { promises as fsp } from 'fs';
import { TranslationService } from 'common/translation.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    private readonly i18n: TranslationService,
    @InjectRepository(Service)
    public serviceRepository: any,
  ) { }


  async getTopCategoriesWithSub(limit: number = 10) {
    return await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.parentId IS NULL')
      .leftJoinAndSelect('category.children', 'subcategory')
      .addOrderBy('category.created_at', 'DESC')
      .take(limit)
      .getMany();
  }


  async getCategory(id: string) {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['services'],
    });

    if (!category) {
      throw new NotFoundException(this.i18n.t('events.categories.errors.not_found'));
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
      throw new NotFoundException(
        this.i18n.t('events.categories.errors.slug_not_found', { args: { slug } })
      );
    }
    const [services, total] = await this.serviceRepository.findAndCount({
      where: { categoryId: category.id },
      relations: {
        seller: {
          person: true, // Fetches profile details for the seller
        },
        category: true,
      },
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
      .select(['category.id', 'category.name_en', 'category.name_ar', 'category.slug', 'category.image'])
      .addSelect('COUNT(service.id)', 'serviceCount')
      .groupBy('category.id')
      .orderBy('serviceCount', 'DESC')
      .limit(limit)
      .getRawMany();
  }


  async markAsTop(categoryId: string, iconUrl: string) {
    const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(this.i18n.t("events.categories.errors.not_found"));

    // limit max top categories
    const count = await this.categoryRepository.count({ where: { top: true } });
    if (count >= 10) {
      throw new BadRequestException(this.i18n.t('events.categories.errors.max_top_reached'));
    }

    category.top = true;
    category.topIconUrl = iconUrl;

    return this.categoryRepository.save(category);
  }

  async updateTopIcon(id: string, iconUrl: string) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException(this.i18n.t("events.categories.errors.not_found"));

    if (!category.top) {
      throw new BadRequestException(this.i18n.t('events.categories.errors.not_marked_as_top'));
    }

    category.topIconUrl = iconUrl;
    await this.categoryRepository.save(category);

    return {
      message: this.i18n.t('events.categories.messages.icon_updated'),
      iconUrl
    };
  }

  async unmarkAsTop(categoryId: string) {
    const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(this.i18n.t('events.categories.errors.not_found'));
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

      return { message: this.i18n.t('events.categories.messages.unmarked_top') };
    }

    category.top = false;
    category.topIconUrl = null;

    return this.categoryRepository.save(category);
  }

  async getTopCategories() {
    return this.categoryRepository.find({
      where: { top: true },
      order: { name_en: 'ASC' }, // or other ordering logic
    });
  }


  // async markAsFreelanceTop(categoryId: string, iconUrl: string) {
  //   const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
  //   if (!category) throw new NotFoundException('Category not found');

  //   // limit max freelance top categories
  //   const count = await this.categoryRepository.count({ where: { freelanceTop: true } });
  //   if (count >= 12) {
  //     throw new BadRequestException('Maximum 12 freelance top categories allowed.');
  //   }

  //   category.freelanceTop = true;
  //   category.freelanceTopIconUrl = iconUrl;

  //   return this.categoryRepository.save(category);
  // }

  // async updateFreelanceTopIcon(id: string, iconUrl: string) {
  //   const category = await this.categoryRepository.findOne({ where: { id } });
  //   if (!category) throw new NotFoundException('Category not found');

  //   if (!category.freelanceTop) throw new NotFoundException('Category is not marked as freelance top');

  //   category.freelanceTopIconUrl = iconUrl;
  //   await this.categoryRepository.save(category);

  //   return { message: 'Freelance top category icon updated', iconUrl };
  // }

  // async unmarkAsFreelanceTop(categoryId: string) {
  //   const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
  //   if (!category) throw new NotFoundException('Category not found');

  //   // delete old icon if exists
  //   if (category.freelanceTopIconUrl) {
  //     const oldPath = join(process.cwd(), category.freelanceTopIconUrl);
  //     try {
  //       await fsp.unlink(oldPath);
  //     } catch (err) {
  //       if ((err as any).code !== 'ENOENT') {
  //         console.error('Failed to delete old freelance top icon:', err);
  //       }
  //     }
  //   }

  //   category.freelanceTop = false;
  //   category.freelanceTopIconUrl = null;

  //   return this.categoryRepository.save(category);
  // }

  // async getFreelanceTopCategories() {
  //   return this.categoryRepository.find({
  //     where: { freelanceTop: true },
  //     order: { name_en: 'ASC' }, // or other ordering logic
  //   });
  // }

}