import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceRequirement, Service, User } from 'entities/global.entity';

@Injectable()
export class ServiceRequirementsService {
  constructor(
    @InjectRepository(ServiceRequirement)
    private requirementRepository: Repository<ServiceRequirement>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getServiceRequirements(serviceId: string) {
    return this.requirementRepository.find({
      where: { serviceId },
      order: { created_at: 'ASC' },
    });
  }
async createRequirements(userId: string, serviceId: string, dtos: any[]) {
  const service = await this.serviceRepository.findOne({
    where: { id: serviceId },
    relations: ['seller'],
  });

  if (!service) throw new NotFoundException('Service not found');
  if (service.sellerId !== userId)
    throw new ForbiddenException('You can only add requirements to your own services');

  const requirements = dtos.map(dto =>
    this.requirementRepository.create({
      ...dto,
      serviceId,
    }),
  );

  return this.requirementRepository.save(requirements as any);
}


  async updateRequirement(userId: string, requirementId: string, updateRequirementDto: any) {
    const requirement = await this.requirementRepository.findOne({
      where: { id: requirementId },
      relations: ['service'],
    });

    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }

    if (requirement.service.sellerId !== userId) {
      throw new ForbiddenException('You can only update requirements for your own services');
    }

    Object.assign(requirement, updateRequirementDto);
    return this.requirementRepository.save(requirement);
  }

  async deleteRequirement(userId: string, requirementId: string) {
    const requirement = await this.requirementRepository.findOne({
      where: { id: requirementId },
      relations: ['service'],
    });

    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }

    if (requirement.service.sellerId !== userId) {
      throw new ForbiddenException('You can only delete requirements for your own services');
    }

    return this.requirementRepository.remove(requirement);
  }
}