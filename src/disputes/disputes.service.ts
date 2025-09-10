import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute, Order, User, Notification, DisputeStatus, OrderStatus } from 'entities/global.entity';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute)
    private disputeRepository: Repository<Dispute>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  async createDispute(userId: string, createDisputeDto: any) {
    const { orderId, reason } = createDisputeDto;

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['buyer', 'seller'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if user is part of this order
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You can only open disputes for your own orders');
    }

    // Check if order is in a disputable state
    if (![OrderStatus.ACCEPTED, OrderStatus.DELIVERED].includes(order.status)) {
      throw new BadRequestException('Order is not in a disputable state');
    }

    // Check if dispute already exists
    const existingDispute = await this.disputeRepository.findOne({
      where: { orderId },
    });

    if (existingDispute) {
      throw new BadRequestException('A dispute already exists for this order');
    }

    const dispute = this.disputeRepository.create({
      orderId,
      raisedById: userId,
      reason,
      status: DisputeStatus.OPEN,
    });

    const savedDispute = await this.disputeRepository.save(dispute);

    // Notify the other party
    const otherUserId = order.buyerId === userId ? order.sellerId : order.buyerId;
    const notification = this.notificationRepository.create({
      userId: otherUserId,
      type: 'dispute_opened',
      title: 'Dispute Opened',
      message: `A dispute has been opened for order #${orderId}. Reason: ${reason}`,
      relatedEntityType: 'dispute',
      relatedEntityId: savedDispute.id,
    }as any);

    await this.notificationRepository.save(notification);

    return savedDispute;
  }

  async getDisputes(status?: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }

    const [disputes, total] = await this.disputeRepository.findAndCount({
      where: whereClause,
      relations: ['order', 'raisedBy', 'order.buyer', 'order.seller'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUserDisputes(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    // Get disputes where user is either the raiser or involved in the order
    const [disputes, total] = await this.disputeRepository
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.order', 'order')
      .leftJoinAndSelect('dispute.raisedBy', 'raisedBy')
      .where('dispute.raisedById = :userId', { userId })
      .orWhere('order.buyerId = :userId', { userId })
      .orWhere('order.sellerId = :userId', { userId })
      .orderBy('dispute.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getDispute(userId: string, userRole: string, disputeId: string) {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: ['order', 'raisedBy', 'order.buyer', 'order.seller'],
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    // Check access: admins or users involved in the order
    const isInvolved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId;
    
    if (userRole !== 'admin' && !isInvolved) {
      throw new ForbiddenException('Access denied');
    }

    return dispute;
  }

  async updateDisputeStatus(userId: string, userRole: string, disputeId: string, status: string) {
    const dispute = await this.getDispute(userId, userRole, disputeId);

    // Only admins can change status to in_review, resolved, rejected
    if (userRole !== 'admin' && status !== DisputeStatus.OPEN) {
      throw new ForbiddenException('Only administrators can change dispute status');
    }

    dispute.status = status as DisputeStatus;
    return this.disputeRepository.save(dispute);
  }

  async proposeResolution(disputeId: string, resolution: string) {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: ['order', 'raisedBy', 'order.buyer', 'order.seller'],
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    dispute.resolution = resolution;
    dispute.status = DisputeStatus.IN_REVIEW;

    const savedDispute = await this.disputeRepository.save(dispute);

    // Notify both parties
    const parties = [dispute.order.buyerId, dispute.order.sellerId];
    
    for (const partyId of parties) {
      const notification = this.notificationRepository.create({
        userId: partyId,
        type: 'dispute_resolution',
        title: 'Dispute Resolution Proposed',
        message: `A resolution has been proposed for dispute #${disputeId}: ${resolution}`,
        relatedEntityType: 'dispute',
        relatedEntityId: disputeId,
      } as any);

      await this.notificationRepository.save(notification);
    }

    return savedDispute;
  }

  async acceptResolution(userId: string, disputeId: string) {
    const dispute = await this.getDispute(userId, 'user', disputeId);

    if (dispute.status !== DisputeStatus.IN_REVIEW) {
      throw new BadRequestException('Resolution is not pending acceptance');
    }

    // Check if user is involved in the dispute
    const isInvolved = dispute.order.buyerId === userId || dispute.order.sellerId === userId;
    if (!isInvolved) {
      throw new ForbiddenException('You are not involved in this dispute');
    }

    // For simplicity, we'll mark as resolved when any party accepts
    // In a real system, you might want both parties to accept or have admin approval
    dispute.status = DisputeStatus.RESOLVED;

    // Implement resolution logic based on the resolution text
    // This would typically involve refunds, order modifications, etc.

    return this.disputeRepository.save(dispute);
  }

  async rejectResolution(userId: string, disputeId: string) {
    const dispute = await this.getDispute(userId, 'user', disputeId);

    if (dispute.status !== DisputeStatus.IN_REVIEW) {
      throw new BadRequestException('Resolution is not pending acceptance');
    }

    // Return to open status for further review
    dispute.status = DisputeStatus.OPEN;
    return this.disputeRepository.save(dispute);
  }

  async getDisputeStats() {
    const total = await this.disputeRepository.count();
    const open = await this.disputeRepository.count({ where: { status: DisputeStatus.OPEN } });
    const inReview = await this.disputeRepository.count({ where: { status: DisputeStatus.IN_REVIEW } });
    const resolved = await this.disputeRepository.count({ where: { status: DisputeStatus.RESOLVED } });
    const rejected = await this.disputeRepository.count({ where: { status: DisputeStatus.REJECTED } });

    return {
      total,
      open,
      inReview,
      resolved,
      rejected,
    };
  }
}