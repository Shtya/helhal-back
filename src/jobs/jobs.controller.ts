import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, Query, UsePipes, ValidationPipe, forwardRef, Inject } from '@nestjs/common';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AccessGuard } from '../auth/guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobDto } from 'dto/job.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from 'src/payments/payments.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private jobsService: JobsService,
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
  ) { }

  @Get()
  async getJobs(@Query() query: any) {
    return this.jobsService.getJobs(query);
  }

  @Get("admin")
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN] })
  async adminGetJobs(@Query() query: any) {
    return this.jobsService.adminGetJobs(query);
  }

  @Get('my-jobs')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.BUYER] })
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
  @RequireAccess({ roles: [UserRole.SELLER] })
  async getMyProposals(@Req() req, @Query('status') status?: string, @Query('page') page: number = 1, @Query('limit') limit: number = 20) {
    return this.jobsService.getUserProposals(req.user.id, status, page, limit);
  }


  @Put('proposals/:proposalId/status')
  @UseGuards(JwtAuthGuard)
  @RequireAccess({ roles: [UserRole.BUYER] })
  async updateProposalStatus(@Param('proposalId') proposalId: string, @Body() body: any, @Req() req: any) {
    return this.jobsService.updateProposalStatusAtomic(req.user.id, req.user.role, proposalId, body.status, { checkout: body.checkout });

  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getJob(@Req() req, @Param('id') id: string) {
    return this.jobsService.getJob(id, req.user?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.BUYER] })
  async createJob(@Req() req, @Body() createJobDto: CreateJobDto) {
    return this.jobsService.createJob(req.user.id, createJobDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.BUYER, UserRole.ADMIN] })
  async updateJob(@Req() req, @Param('id') id: string, @Body() updateJobDto: UpdateJobDto) {
    return this.jobsService.updateJob(req.user.id, id, updateJobDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.BUYER, UserRole.ADMIN] })
  async deleteJob(@Req() req, @Param('id') id: string) {
    return this.jobsService.deleteJob(req.user.id, id);
  }

  @Post(':id/proposals')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.SELLER] })
  async submitProposal(@Req() req, @Param('id') id: string, @Body() submitProposalDto: any) {
    return this.jobsService.submitProposal(req.user.id, id, submitProposalDto);
  }

  @Get(':id/proposals')
  @UseGuards(JwtAuthGuard)
  @RequireAccess({ roles: [UserRole.ADMIN] })
  async getJobProposals(
    @Req() req,
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortdir') sortdir?: 'asc' | 'desc',
  ) {
    return this.jobsService.getJobProposals(
      req.user.id,
      req.user.role,
      id,
      page,
      search,
      status,
      sortBy,
      sortdir,
    );
  }

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard)
  @RequireAccess({ roles: [UserRole.ADMIN] })
  async getJobStats(@Req() req) {
    return this.jobsService.getJobStats(req.user.id);
  }

  @Put(':id/publish')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN] })
  async publishJob(@Param('id') id: string) {
    return this.jobsService.publishJob(id);
  }
}
