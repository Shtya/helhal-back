// create-job.dto.ts
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { BudgetType, JobStatus } from 'entities/global.entity';

export class CreateJobDto {
  @IsString()
  title: string;


  @IsString()
  description: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  subcategoryId?: string;

  @IsNumber()
  @Min(0)
  budget: number;

  @IsNumber()
  preferredDeliveryDays: number;

  @IsEnum(BudgetType)
  budgetType: BudgetType;

	@IsEnum(JobStatus)
	status : JobStatus

 
  @IsArray()
  @IsString({ each: true })
  skillsRequired: string[];

  @IsOptional()
  @IsArray()
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
  }>;

  @IsOptional()
  @IsString()
  additionalInfo?: string;
}

// update-job.dto.ts
import { PartialType } from '@nestjs/mapped-types';
 
export class UpdateJobDto extends PartialType(CreateJobDto) {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}
 
 