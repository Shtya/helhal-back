import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobDto } from 'dto/job.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
// @UsePipes(new ValidationPipe({ transform: true }))
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Get()
  async getJobs(@Query() query: any, @Req() req: any) {
    return CRUD.findAll(
      this.jobsService.jobRepository,
      'job',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ['buyer'], // relation
      ['title', 'budget'], // search
      query.filters, // filter
    );
  }
  @Get('my-jobs')
  async getMyJobs(@Query() query: any, @Req() req: any) {
    return CRUD.findAll(
      this.jobsService.jobRepository,
      'job',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ['buyer', 'proposals'], // relation
      ['status'], // search
      { buyer: { id: req.user.id } }, // filter
    );
  }

  @Get('my-proposals')
  @UseGuards(JwtAuthGuard)
  async getMyProposals(@Req() req, @Query('status') status?: string, @Query('page') page: number = 1) {
    return this.jobsService.getUserProposals(req.user.id, status, page);
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    return this.jobsService.getJob(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async createJob(@Req() req, @Body() createJobDto: CreateJobDto) {
    return this.jobsService.createJob(req.user.id, createJobDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  async updateJob(@Req() req, @Param('id') id: string, @Body() updateJobDto: UpdateJobDto) {
    return this.jobsService.updateJob(req.user.id, id, updateJobDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  async deleteJob(@Req() req, @Param('id') id: string) {
    return this.jobsService.deleteJob(req.user.id, id);
  }

  @Post(':id/proposals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  async submitProposal(@Req() req, @Param('id') id: string, @Body() submitProposalDto: any) {
    return this.jobsService.submitProposal(req.user.id, id, submitProposalDto);
  }

  @Get(':id/proposals')
  @UseGuards(JwtAuthGuard)
  async getJobProposals(@Req() req, @Param('id') id: string, @Query('page') page: number = 1) {
    return this.jobsService.getJobProposals(req.user.id, req.user.role, id, page);
  }

  @Put('proposals/:proposalId/status')
  @UseGuards(JwtAuthGuard)
  async updateProposalStatus(@Req() req, @Param('proposalId') proposalId: string, @Body() body: { status: string }) {
    return this.jobsService.updateProposalStatus(req.user.id, req.user.role, proposalId, body.status);
  }

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard)
  async getJobStats(@Req() req) {
    return this.jobsService.getJobStats(req.user.id);
  }

  @Put(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async publishJob(@Param('id') id: string) {
    return this.jobsService.publishJob(id);
  }
}
