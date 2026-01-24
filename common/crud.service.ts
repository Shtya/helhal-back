import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { Repository, Brackets, IsNull, Not, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { User } from 'entities/global.entity';
import * as crypto from 'crypto';

export interface CustomPaginatedResponse<T> {
  total_records: number;
  current_page: number;
  per_page: number;
  records: T[];
}

export interface IPaginateOptions<T extends ObjectLiteral> {
  queryBuilder: SelectQueryBuilder<T>;
  alias?: string;
  sortField?: string; // e.g., 'conversation.sort_id' or 'lastMessage.sort_id'
  cursor?: { createdAt: Date; id: string };    // The ULID string from the last item
  limit?: number;
  sort?: "DESC" | "ASC"
}

export class CRUD {
  static async findAll<T>(repository: Repository<T>,
    entityName: string,
    search?: string,
    page: any = 1,
    limit: any = 10,
    sortBy?: string,
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    relations?: string[],
    searchFields?: string[],
    filters?: Record<string, any>,
    extraSelects?: string[],
  ): Promise<CustomPaginatedResponse<T>> {
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      throw new BadRequestException('Pagination parameters must be valid numbers greater than 0.');
    }

    if (!['ASC', 'DESC'].includes(sortOrder)) {
      throw new BadRequestException("Sort order must be either 'ASC' or 'DESC'.");
    }

    const skip = (pageNumber - 1) * limitNumber;
    const query = repository.createQueryBuilder(entityName).skip(skip).take(limitNumber);

    if (relations?.length > 0) {
      const invalidRelations = relations.filter(relation => !repository.metadata.relations.some(rel => rel.propertyName === relation));
      if (invalidRelations.length > 0) {
        throw new BadRequestException(`Invalid relations: ${invalidRelations.join(', ')}`);
      }
      relations.forEach(relation => {
        query.leftJoinAndSelect(`${entityName}.${relation}`, relation);
      });
    }

    if (extraSelects?.length) {
      extraSelects.forEach(col => {
        query.addSelect(`${entityName}.${col}`);
      });
    }

    function flatten(obj: any, prefix = ''): Record<string, any> {
      let result: Record<string, any> = {};

      Object.entries(obj).forEach(([key, value]) => {
        const prefixedKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          // Detect operator objects (contain keys like not, isNull, in, like)
          const operatorKeys = ['not', 'isNull', 'in', 'like'];
          const isOperatorObject = Object.keys(value).some(k =>
            operatorKeys.includes(k)
          );

          if (isOperatorObject) {
            // Preserve operator object as-is
            result[prefixedKey] = value;
          } else {
            // Normal nested object → keep flattening
            Object.assign(result, flatten(value, prefixedKey));
          }
        } else {
          result[prefixedKey] = value;
        }
      });

      return result;
    }


    if (filters && Object.keys(filters).length > 0) {
      const flatFilters = flatten(filters);
      Object.entries(flatFilters).forEach(([flatKey, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          const fullPath = flatKey.includes('.') ? flatKey : `${entityName}.${flatKey}`;
          const paramKey = flatKey.replace(/\./g, '_');
          // Handle explicit null
          if (value === null) {
            query.andWhere(`${fullPath} IS NULL`);
            return;
          }

          // Handle special operators
          if (typeof value === 'object' && value !== null) {
            // Example: { not: 5 } → NOT EQUAL
            if ('not' in value) {
              query.andWhere(`${fullPath} != :${paramKey}`, {
                [paramKey]: value.not,
              });
              return;
            }

            // Example: { isNull: true } → IS NULL
            if (value.isNull === true) {
              query.andWhere(`${fullPath} IS NULL`);
              return;
            }

            // Example: { isNull: false } → IS NOT NULL
            if (value.isNull === false) {
              query.andWhere(`${fullPath} IS NOT NULL`);
              return;
            }

            if ('in' in value) {
              query.andWhere(`${fullPath} IN (:...${paramKey})`, {
                [paramKey]: value.in,
              });
              return;
            }

          }
          // Default: equality
          query.andWhere(`${fullPath} = :${paramKey}`, {
            [paramKey]: value,
          });

        }
      });
    }

    if (search && searchFields?.length >= 1) {
      query.andWhere(
        new Brackets(qb => {
          searchFields.forEach(field => {
            let currentAlias = entityName;
            let propertyName = field;

            // 1. Handle nested relations (e.g., 'person.username')
            if (field.includes('.')) {
              const parts = field.split('.');
              currentAlias = parts[0];   // e.g., 'person'
              propertyName = parts[1];   // e.g., 'username'
            }

            const columnMetadata = repository.metadata.columns.find(
              col => col.propertyName === propertyName && col.entityMetadata.targetName.toLowerCase() === (field.includes('.') ? propertyName : entityName)
            ) || repository.metadata.columns.find(col => col.propertyName === propertyName);

            const fullPath = `${currentAlias}.${propertyName}`;

            if (columnMetadata?.type === 'jsonb') {
              qb.orWhere(`LOWER(${fullPath}::text) LIKE LOWER(:search)`, { search: `%${search}%` });
            } else if (columnMetadata?.type === String || columnMetadata?.type == 'text') {
              qb.orWhere(`LOWER(${fullPath}) LIKE LOWER(:search)`, {
                search: `%${search}%`,
              });
            } else if (['decimal', 'float'].includes(columnMetadata?.type as any)) {
              const numericSearch = parseFloat(search);
              if (!isNaN(numericSearch))
                qb.orWhere(`${fullPath} = :numericSearch`, {
                  numericSearch,
                });
            } else if (columnMetadata?.type === 'enum') {
              const enumValues = columnMetadata.enum;
              if (enumValues.includes(search)) {
                qb.orWhere(`${fullPath} = :value`, {
                  value: search,
                });
              } else {
                throw new BadRequestException(`Invalid value '${search}' for enum field '${field}'. Allowed values: ${enumValues.join(', ')}`);
              }
            } else {
              qb.orWhere(`${fullPath} = :search`, { search });
            }
          });
        }),
      );
    }



    const defaultSortBy = 'created_at';
    const sortField = sortBy || defaultSortBy;
    const sortDirection = sortOrder || 'DESC';

    const columnExists = repository.metadata.columns.some(col => col.propertyName === sortField);
    if (!columnExists) {
      throw new BadRequestException(`Invalid sortBy field: '${sortField}'`);
    }

    query.orderBy(`${entityName}.${sortField}`, sortDirection);


    const [data, total] = await query.getManyAndCount();

    return {
      total_records: total,
      current_page: pageNumber,
      per_page: limitNumber,
      records: data,
    };
  }

  static async paginateCursor<T extends ObjectLiteral>(options: IPaginateOptions<T>) {
    const {
      queryBuilder,
      alias = 'entity',
      sortField = `${alias}.created_at`,
      cursor,
      limit = 50,
      sort = 'DESC'
    } = options;


    if (cursor) {
      queryBuilder.andWhere(
        `(${alias}.created_at, ${alias}.id) < (:createdAt, :id)`,
        { createdAt: cursor.createdAt, id: cursor.id }
      );
    }

    queryBuilder
      .orderBy(sortField, sort)
      .addOrderBy(`${alias}.id`, sort)
      .take(limit + 1);

    const items = await queryBuilder.getMany();

    // 3. Logic for "hasMore" and nextCursor
    const hasMore = items.length > limit;

    if (hasMore) items.pop();

    const nextCursor = hasMore
      ? {
        createdAt: (items[items.length - 1] as any).created_at,
        id: (items[items.length - 1] as any).id,
      }
      : null;

    return { items, nextCursor, hasMore };
  }

  static async delete<T>(repository: Repository<T>, entityName: string, id: number | string): Promise<{ message: string }> {
    const entity = await repository.findOne({ where: { id } as any });

    if (!entity) {
      throw new BadRequestException(`${entityName} with ID ${id} not found.`);
    }

    await repository.delete(id);

    return {
      message: `${entityName} deleted successfully.`,
    };
  }

  static async softDelete<T>(repository: Repository<T>, entityName: string, id: number | string): Promise<{ message: string }> {
    const entity = await repository.findOne({ where: { id } as any });

    if (!entity) {
      throw new BadRequestException(`${entityName} with ID ${id} not found.`);
    }

    await repository.softDelete(id);

    return {
      message: `${entityName} soft-deleted successfully.`,
    };
  }

  static async findOne<T>(repository: Repository<T>, entityName: string, id: number | string, relations?: string[]): Promise<T> {
    if (relations?.length > 0) {
      const invalidRelations = relations.filter(relation => !repository.metadata.relations.some(rel => rel.propertyName === relation));
      if (invalidRelations.length > 0) {
        throw new BadRequestException(`Invalid relations: ${invalidRelations.join(', ')}`);
      }
    }

    const entity = await repository.findOne({
      where: { id } as any,
      relations: relations || [],
    });

    if (!entity) {
      throw new BadRequestException(`${entityName} with ID ${id} not found.`);
    }

    return entity;
  }

  static async exportEntityToExcel<T>(
    repository: Repository<T>,
    fileName: string,
    res: any,
    options: {
      exportLimit?: number | string;
      columns?: { header: string; key: string; width?: number }[];
    } = {},
  ) {
    const exportLimit = Number(options.exportLimit) || 10;

    const data = await repository.find({
      take: exportLimit,
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    const columns =
      options.columns ??
      (data.length > 0
        ? Object.keys(data[0])
          .filter(key => key !== 'updated_at' && key !== 'deleted_at')
          .map(key => ({ header: key, key, width: 20 }))
        : []);

    worksheet.columns = columns;

    data.forEach(item => {
      const rowData: any = { ...item };
      delete rowData.updated_at;
      delete rowData.deleted_at;

      const row = worksheet.addRow(rowData);

      row.eachCell(cell => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCCCCC' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    worksheet.columns.forEach(column => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const cellValue = cell.value ? cell.value.toString() : '';
        if (cellValue.length > maxLength) maxLength = cellValue.length;
      });
      column.width = maxLength + 2;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }

  static processReferral = async (
    newUser: any,
    referralCodeUsed?: string,
    userRepository?: Repository<User>, // تم إضافة الـ userRepository كـ parameter
  ): Promise<void> => {
    if (!referralCodeUsed) {
      return;
    }

    try {
      const referrerUser = await userRepository.findOne({ where: { person: { referralCode: referralCodeUsed } } });

      if (referrerUser) {
        newUser.referredBy = referrerUser;
        newUser.referredById = referrerUser.id;

        // هنا بدلاً من استخدام save() من الكائن newUser، استخدم الـ repository
        await userRepository.save(newUser); // حفظ المستخدم الجديد

        referrerUser.person.referralCount = (referrerUser.referralCount || 0) + 1;
        referrerUser.person.referralRewardsCount = (referrerUser.referralRewardsCount || 0) + 1;

        await userRepository.save(referrerUser); // حفظ التعديلات على الـ referrerUser

        console.log(`Referral processed: User ${newUser.email} referred by ${referrerUser.email}`);
      } else {
        console.warn(`Referral code '${referralCodeUsed}' used by ${newUser.email} not found.`);
      }
    } catch (error) {
      console.error(`Error processing referral for user ${newUser.email} with code ${referralCodeUsed}:`, error);
    }
  };

  static generateUniqueReferralCode = async (userRepository: Repository<User>): Promise<string> => {
    let referralCode: string = '';
    let isUnique = false;
    const CODE_LENGTH = 8;

    // Loop until a unique code is generated
    while (!isUnique) {
      referralCode = crypto
        .randomBytes(Math.ceil(CODE_LENGTH / 2))
        .toString('hex')
        .slice(0, CODE_LENGTH)
        .toUpperCase();

      // استخدام repository للبحث عن المستخدم باستخدام referralCode
      const existingUser = await userRepository.findOne({ where: { person: { referralCode } } });
      if (!existingUser) {
        isUnique = true;
      }
    }

    return referralCode;
  };
}
