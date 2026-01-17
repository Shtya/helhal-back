import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AbuseReport, User, Service, Notification, AbuseReportStatus } from 'entities/global.entity';

@Injectable()
export class AbuseReportsService {
  constructor(
    @InjectRepository(AbuseReport)
    private abuseReportRepository: Repository<AbuseReport>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) { }

  async createReport(userId: string, createReportDto: any) {
    const { reason, reportedUserId, reportedServiceId } = createReportDto;

    if (!reportedUserId && !reportedServiceId) {
      throw new Error('Either reportedUserId or reportedServiceId must be provided');
    }

    // Validate reported entities exist
    if (reportedUserId) {
      const reportedUser = await this.userRepository.findOne({ where: { id: reportedUserId } });
      if (!reportedUser) {
        throw new NotFoundException('Reported user not found');
      }
    }

    if (reportedServiceId) {
      const reportedService = await this.serviceRepository.findOne({ where: { id: reportedServiceId } });
      if (!reportedService) {
        throw new NotFoundException('Reported service not found');
      }
    }

    const report = this.abuseReportRepository.create({
      reporterId: userId,
      reportedUserId,
      reportedServiceId,
      reason,
      status: AbuseReportStatus.PENDING,
    });

    return this.abuseReportRepository.save(report);
  }

  async getReports(status?: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }

    const [reports, total] = await this.abuseReportRepository.findAndCount({
      where: whereClause,
      relations: {
        reporter: {
          person: true // Fetches the profile of the user who filed the report
        },
        reportedUser: {
          person: true // Fetches the profile of the user being accused
        },
        reportedService: {
          seller: {
            person: true // Optional: Fetches the profile of the service owner
          }
        }
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUserReports(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const [reports, total] = await this.abuseReportRepository.findAndCount({
      where: { reporterId: userId },
      relations: {
        reportedUser: {
          person: true // Fetches the profile of the user being accused
        },
        reportedService: {
          seller: {
            person: true // Optional: Fetches the profile of the service owner
          }
        }
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getReport(userId: string, userRole: string, reportId: string) {
    const report = await this.abuseReportRepository.findOne({
      where: { id: reportId },
      relations: {
        reporter: {
          person: true // Fetches the profile of the user who filed the report
        },
        reportedUser: {
          person: true // Fetches the profile of the user being accused
        },
        reportedService: {
          seller: {
            person: true // Optional: Fetches the profile of the service owner
          }
        }
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Only admins or the reporter can view the report
    if (userRole !== 'admin' && report.reporterId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return report;
  }

  async updateReportStatus(reportId: string, status: string, actionTaken?: string) {
    const report = await this.abuseReportRepository.findOne({
      where: { id: reportId },
      relations: {
        reporter: {
          person: true // Fetches the profile of the user who filed the report
        },
        reportedUser: {
          person: true // Fetches the profile of the user being accused
        },
        reportedService: {
          seller: {
            person: true // Optional: Fetches the profile of the service owner
          }
        }
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    report.status = status as AbuseReportStatus;

    if (actionTaken) {
      report.reason += `\n\nAction Taken: ${actionTaken}`;
    }

    const savedReport = await this.abuseReportRepository.save(report);

    // Notify reporter about status update
    if (report.reporterId) {
      const notification = this.notificationRepository.create({
        userId: report.reporterId,
        type: 'abuse_report_update',
        title: 'Abuse Report Status Updated',
        message: `Your abuse report has been ${status}. ${actionTaken ? 'Action taken: ' + actionTaken : ''}`,
        relatedEntityType: 'abuse_report',
        relatedEntityId: reportId,
      } as any);

      await this.notificationRepository.save(notification);
    }

    return savedReport;
  }

  async getReportStats() {
    const total = await this.abuseReportRepository.count();
    const pending = await this.abuseReportRepository.count({ where: { status: AbuseReportStatus.PENDING } });
    const reviewed = await this.abuseReportRepository.count({ where: { status: AbuseReportStatus.REVIEWED } });
    const actionTaken = await this.abuseReportRepository.count({ where: { status: AbuseReportStatus.ACTION_TAKEN } });
    const dismissed = await this.abuseReportRepository.count({ where: { status: AbuseReportStatus.DISMISSED } });

    return {
      total,
      pending,
      reviewed,
      actionTaken,
      dismissed,
    };
  }

  async takeActionOnUser(userId: string, action: string, reason: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Implement different actions based on the action type
    switch (action) {
      case 'warn':
        // Send warning notification
        const warningNotification = this.notificationRepository.create({
          userId,
          type: 'admin_warning',
          title: 'Administrative Warning',
          message: `You have received a warning from administrators: ${reason}`,
        });
        await this.notificationRepository.save(warningNotification);
        break;

      case 'suspend':
        user.person.status = 'suspended' as any;
        await this.userRepository.save(user);

        const suspensionNotification = this.notificationRepository.create({
          userId,
          type: 'account_suspended',
          title: 'Account Suspended',
          message: `Your account has been suspended: ${reason}`,
        });
        await this.notificationRepository.save(suspensionNotification);
        break;

      case 'ban':
        user.person.status = 'deleted' as any;
        await this.userRepository.save(user);

        const banNotification = this.notificationRepository.create({
          userId,
          type: 'account_banned',
          title: 'Account Banned',
          message: `Your account has been permanently banned: ${reason}`,
        });
        await this.notificationRepository.save(banNotification);
        break;
    }

    return { success: true, message: `Action "${action}" taken on user` };
  }
}