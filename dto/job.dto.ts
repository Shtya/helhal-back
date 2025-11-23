// create-job.dto.ts
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, Max, ArrayMinSize, ArrayMaxSize, ValidateNested, MinLength, MaxLength } from 'class-validator';
import { BudgetType, JobStatus } from 'entities/global.entity';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';


export class JobAttachmentDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsString()
  url: string;
}

export class CreateJobDto {
  @IsString()
  @MinLength(5, { message: 'Title must be at least 5 characters' })
  @MaxLength(100, { message: 'Title must be at most 100 characters' })
  title: string;

  @IsString()
  @MinLength(12, { message: 'Description must be at least 12 characters' })
  @MaxLength(15000, { message: 'Description must be at most 15,000 characters' })
  description: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  subcategoryId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one skill is required' })
  @ArrayMaxSize(15, { message: `You can add up to ${15} skills` })
  @IsString({ each: true })
  skillsRequired: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'You can upload up to 10 attachments' })
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
  }>;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Additional info must be at most 5,000 characters' })
  additionalInfo?: string;

  @IsNumber({}, { message: 'Budget must be a number' })
  @Min(0, { message: 'Budget must be positive' })
  @Max(100000, { message: 'Budget must not exceed 100,000' })
  budget: number;

  @IsEnum(BudgetType, { message: 'Budget type must be fixed or hourly' })
  budgetType: BudgetType;

  @IsNumber({}, { message: 'Preferred delivery days must be a number' })
  @Min(1, { message: 'Minimum 1 day' })
  @Max(1200, { message: 'Maximum delivery time is 1200 days' })
  preferredDeliveryDays: number;

  @IsEnum(JobStatus)
  status: JobStatus;
}

export class UpdateJobDto extends PartialType(CreateJobDto) {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

