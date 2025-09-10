import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { ServiceRequirementsService } from './service-requirements.service';

@Controller('service-requirements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER, UserRole.ADMIN)
export class ServiceRequirementsController {
  constructor(private requirementsService: ServiceRequirementsService) {}

  @Get('service/:serviceId')
  async getServiceRequirements(@Param('serviceId') serviceId: string) {
    return this.requirementsService.getServiceRequirements(serviceId);
  }

  @Post('service/:serviceId')
  async createRequirement(@Req() req, @Param('serviceId') serviceId: string, @Body() createRequirementDto: any) {
    return this.requirementsService.createRequirements(req.user.id, serviceId, createRequirementDto);
  }

  @Put(':id')
  async updateRequirement(@Req() req, @Param('id') id: string, @Body() updateRequirementDto: any) {
    return this.requirementsService.updateRequirement(req.user.id, id, updateRequirementDto);
  }

  @Delete(':id')
  async deleteRequirement(@Req() req, @Param('id') id: string) {
    return this.requirementsService.deleteRequirement(req.user.id, id);
  }
}