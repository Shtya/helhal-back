import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, User, Notification, SupportTicketStatus, SupportTicketPriority } from 'entities/global.entity';

@Injectable()
export class SupportTicketsService {
  constructor(
    @InjectRepository(SupportTicket)
    private supportTicketRepository: Repository<SupportTicket>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  async createTicket(userId: string, createTicketDto: any) {
    const { subject, message, priority = SupportTicketPriority.LOW } = createTicketDto;

    const ticket = this.supportTicketRepository.create({
      userId,
      subject,
      message,
      priority,
      status: SupportTicketStatus.OPEN,
    });

    const savedTicket = await this.supportTicketRepository.save(ticket);

    // Notify admins about new ticket
    const admins = await this.userRepository.find({ where: { role: 'admin' } });
    
    for (const admin of admins) {
      const notification = this.notificationRepository.create({
        userId: admin.id,
        type: 'new_support_ticket',
        title: 'New Support Ticket',
        message: `A new support ticket has been created: ${subject}`,
        relatedEntityType: 'support_ticket',
        relatedEntityId: savedTicket.id,
      }as any);

      await this.notificationRepository.save(notification);
    }

    return savedTicket;
  }

  async getTickets(status?: string, priority?: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }
    if (priority) {
      whereClause.priority = priority;
    }

    const [tickets, total] = await this.supportTicketRepository.findAndCount({
      where: whereClause,
      relations: ['user'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      tickets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUserTickets(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const [tickets, total] = await this.supportTicketRepository.findAndCount({
      where: { userId },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      tickets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getTicket(userId: string, userRole: string, ticketId: string) {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id: ticketId },
      relations: ['user'],
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Only admins or the ticket creator can view the ticket
    if (userRole !== 'admin' && ticket.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return ticket;
  }

  async updateTicketStatus(userId: string, userRole: string, ticketId: string, status: string) {
    const ticket = await this.getTicket(userId, userRole, ticketId);

    // Only admins can change status from OPEN to other states
    if (userRole !== 'admin' && ticket.status !== SupportTicketStatus.OPEN) {
      throw new ForbiddenException('Only administrators can change ticket status');
    }

    ticket.status = status as SupportTicketStatus;
    const savedTicket = await this.supportTicketRepository.save(ticket);

    // Notify user about status change
    if (ticket.userId !== userId) {
      const notification = this.notificationRepository.create({
        userId: ticket.userId,
        type: 'ticket_status_update',
        title: 'Ticket Status Updated',
        message: `Your support ticket "${ticket.subject}" has been ${status}`,
        relatedEntityType: 'support_ticket',
        relatedEntityId: ticketId,
      }as any);

      await this.notificationRepository.save(notification);
    }

    return savedTicket;
  }

  async updateTicketPriority(ticketId: string, priority: string) {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    ticket.priority = priority as SupportTicketPriority;
    return this.supportTicketRepository.save(ticket);
  }

  async addResponse(userId: string, userRole: string, ticketId: string, message: string, isInternal: boolean = false) {
    const ticket = await this.getTicket(userId, userRole, ticketId);

    // For internal responses, only admins can add them
    if (isInternal && userRole !== 'admin') {
      throw new ForbiddenException('Only administrators can add internal responses');
    }

    // Append response to the ticket message
    const responsePrefix = isInternal ? '\n\n[INTERNAL] ' : '\n\n';
    const userIdentifier = userRole === 'admin' ? 'Admin' : 'User';
    
    ticket.message += `${responsePrefix}${userIdentifier} Response: ${message}`;

    const savedTicket = await this.supportTicketRepository.save(ticket);

    // Notify the other party
    if (!isInternal) {
      const otherUserId = userRole === 'admin' ? ticket.userId : null; // Notify admins if user responded
      
      if (otherUserId) {
        const notification = this.notificationRepository.create({
          userId: otherUserId,
          type: 'ticket_response',
          title: 'New Response on Ticket',
          message: `A new response has been added to ticket: ${ticket.subject}`,
          relatedEntityType: 'support_ticket',
          relatedEntityId: ticketId,
        }as any);

        await this.notificationRepository.save(notification);
      } else if (userRole !== 'admin') {
        // Notify all admins when a user responds
        const admins = await this.userRepository.find({ where: { role: 'admin' } });
        
        for (const admin of admins) {
          const notification = this.notificationRepository.create({
            userId: admin.id,
            type: 'ticket_response',
            title: 'User Response on Ticket',
            message: `A user has responded to ticket: ${ticket.subject}`,
            relatedEntityType: 'support_ticket',
            relatedEntityId: ticketId,
          }as any);

          await this.notificationRepository.save(notification);
        }
      }
    }

    return savedTicket;
  }

  async getTicketStats() {
    const total = await this.supportTicketRepository.count();
    const open = await this.supportTicketRepository.count({ where: { status: SupportTicketStatus.OPEN } });
    const inProgress = await this.supportTicketRepository.count({ where: { status: SupportTicketStatus.IN_PROGRESS } });
    const resolved = await this.supportTicketRepository.count({ where: { status: SupportTicketStatus.RESOLVED } });
    const closed = await this.supportTicketRepository.count({ where: { status: SupportTicketStatus.CLOSED } });

    const highPriority = await this.supportTicketRepository.count({ where: { priority: SupportTicketPriority.HIGH } });
    const mediumPriority = await this.supportTicketRepository.count({ where: { priority: SupportTicketPriority.MEDIUM } });
    const lowPriority = await this.supportTicketRepository.count({ where: { priority: SupportTicketPriority.LOW } });

    return {
      total,
      byStatus: { open, inProgress, resolved, closed },
      byPriority: { high: highPriority, medium: mediumPriority, low: lowPriority },
    };
  }

  async getAverageResolutionTime() {
    const resolvedTickets = await this.supportTicketRepository.find({
      where: { status: SupportTicketStatus.RESOLVED },
    });

    if (resolvedTickets.length === 0) {
      return { averageHours: 0 };
    }

    let totalHours = 0;
    
    for (const ticket of resolvedTickets) {
      const created = new Date(ticket.created_at);
      const resolved = new Date(ticket.updated_at); // Assuming updated_at is when it was resolved
      const hours = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
      totalHours += hours;
    }

    return { averageHours: totalHours / resolvedTickets.length };
  }
}