import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Dispute, Order, User, Notification, DisputeStatus, OrderStatus, Setting, DisputeMessage } from 'entities/global.entity';
import { AccountingService } from 'src/accounting/accounting.service';
import { PermissionBitmaskHelper } from 'src/auth/permission-bitmask.helper';
import { Permissions } from 'entities/permissions';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute) private disputeRepository: Repository<Dispute>,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(DisputeMessage) private dmRepo: Repository<DisputeMessage>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(Notification) private notificationRepository: Repository<Notification>,
    private accountingService: AccountingService,
    private dataSource: DataSource,
  ) { }

  async createDispute(userId: string, createDisputeDto: any) {
    const { orderId, reason, type, subject } = createDisputeDto;

    const order = await this.orderRepository.findOne({ where: { id: orderId }, relations: ['buyer', 'seller'] });

    if (!order) throw new NotFoundException('Order not found');

    if (order.buyerId !== userId && order.sellerId !== userId) throw new ForbiddenException('You can only open disputes for your own orders');

    if (![OrderStatus.ACCEPTED, OrderStatus.DELIVERED, OrderStatus.ChangeRequested].includes(order.status)) throw new BadRequestException('Order is not in a disputable state');


    // const existing = await this.disputeRepository.findOne({ where: { orderId } });
    // if (existing) throw new BadRequestException('A dispute already exists for this order');

    const dispute = this.disputeRepository.create({ orderId, raisedById: userId, reason, type, subject, status: DisputeStatus.OPEN });
    const savedDispute = await this.disputeRepository.save(dispute);

    // Update order -> DISPUTED + timeline
    order.status = OrderStatus.DISPUTED;
    order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_opened', by: userId, reason }];
    await this.orderRepository.save(order);

    // notify other party
    const otherUserId = order.buyerId === userId ? order.sellerId : order.buyerId;
    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: otherUserId,
        type: 'dispute_opened',
        title: 'Dispute opened',
        message: `A dispute has been opened for "${order.title}". Reason: ${reason}`,
        relatedEntityType: 'dispute',
        relatedEntityId: savedDispute.id,
      }) as any,
    );

    // notify platform account (admin inbox)
    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (platformUserId) {
      await this.notificationRepository.save(
        this.notificationRepository.create({
          userId: platformUserId,
          type: 'dispute_opened',
          title: 'New dispute',
          message: `Order "${order.title}" is now in dispute.`,
          relatedEntityType: 'dispute',
          relatedEntityId: savedDispute.id,
        }) as any,
      );
    }

    return savedDispute;
  }

  async getActivity(userId: string, userRole: string, disputeId: string) {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: ['order', 'raisedBy', 'order.buyer', 'order.seller'],
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const user: any = await this.userRepository.findOne({ where: { id: userId } });
    const hasPermission = PermissionBitmaskHelper.has(user.permissions.disputes, Permissions.Disputes.Chat);

    const involved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId || user.role === 'admin' || hasPermission;
    if (!involved) throw new ForbiddenException('Access denied');

    // order + invoice
    const order = await this.orderRepository.findOne({
      where: { id: dispute.orderId },
      relations: ['buyer', 'seller', 'invoices'],
    });
    const invoice = order?.invoices?.[0] || null;

    // messages (threaded) - limit to 50 for activity view
    const [messages, total] = await this.dmRepo.findAndCount({
      where: { disputeId },
      relations: ['sender'],
      order: { created_at: 'ASC' },
      take: 50,
    });

    // derived events
    const events: any[] = [{ type: 'opened', at: dispute.created_at, by: dispute.raisedBy?.username || dispute.raisedById }];
    if (dispute.resolution) {
      events.push({
        type: 'resolution_proposed',
        at: dispute.updated_at || dispute.created_at,
        resolution: this.tryParse(dispute.resolution),
      });
    }
    if (dispute.status && dispute.status !== 'open') {
      events.push({ type: 'status', at: dispute.updated_at || dispute.created_at, to: dispute.status });
    }
    for (const m of messages) {
      events.push({
        type: 'message',
        at: m.created_at,
        by: m.sender?.username || m.senderId,
        message: m.message,
      });
    }
    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return {
      dispute,
      order: order ? { id: order.id, title: order.title, buyer: order.buyer, seller: order.seller, status: order.status } : null,
      invoice: invoice
        ? {
          id: invoice.id,
          subtotal: invoice.subtotal,
          serviceFee: invoice.serviceFee,
          totalAmount: invoice.totalAmount,
        }
        : null,
      messages: messages.map(m => ({
        id: m.id,
        parentId: (m as any).parentId || null,
        sender: m.sender ? { id: m.sender.id, username: m.sender.username, profileImage: m.sender.profileImage } : { id: m.senderId },
        message: m.message,
        created_at: m.created_at,
      })),
      hasMore: total > messages.length,
      events,
    };
  }

  async postMessage(userId: string, userRole: string, disputeId: string, message: string, parentId?: string) {
    const text = (message || '').trim();
    if (!text) throw new BadRequestException('Message required');

    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId }, relations: ['order'] });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const user = await this.userRepository.findOne({ where: { id: userId } });
    const hasPermission = PermissionBitmaskHelper.has(user.permissions.disputes, Permissions.Disputes.Chat);

    const involved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId || user?.role === 'admin' || hasPermission;
    if (!involved) throw new ForbiddenException('Access denied');

    if ([DisputeStatus.RESOLVED, DisputeStatus.REJECTED].includes(dispute.status)) {
      throw new BadRequestException('Cannot post messages on a closed dispute');
    }

    if (parentId) {
      const parent = await this.dmRepo.findOne({ where: { id: parentId, disputeId } });
      if (!parent) throw new BadRequestException('Parent message not found in this dispute');
    }

    const dm = this.dmRepo.create({ disputeId, senderId: userId, message: text, ...(parentId ? { parentId } : {}) } as any);
    const saved: any = await this.dmRepo.save(dm);

    // notify the other side
    const recipientIds = new Set<string>();
    if (dispute.order.buyerId !== userId) recipientIds.add(dispute.order.buyerId);
    if (dispute.order.sellerId !== userId) recipientIds.add(dispute.order.sellerId);

    for (const rid of recipientIds) {
      await this.notificationRepository.save(
        this.notificationRepository.create({
          userId: rid,
          type: 'dispute_message',
          title: 'New dispute message',
          message: text.slice(0, 2000),
          relatedEntityType: 'dispute',
          relatedEntityId: disputeId,
        }) as any,
      );
    }
    return { ok: true, id: saved.id };
  }

  tryParse(v: any) {
    if (!v) return null;
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }

  async getDisputes(query: {
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const qb = this.disputeRepository
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.order', 'order')
      .leftJoinAndSelect('dispute.raisedBy', 'raisedBy')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('order.seller', 'seller');

    // --- Filter by status ---
    if (query.status && query.status !== 'all') {
      qb.andWhere('dispute.status = :status', { status: query.status });
    }

    // --- Search ---
    if (query.search) {
      qb.andWhere(
        '(order.title ILIKE :search OR dispute.subject ILIKE :search)',
        { search: `%${query.search}%` }
      );
    }

    // --- Sorting ---
    const validSortFields = ['created_at', 'updated_at', 'subject', 'status'];
    const sortBy = validSortFields.includes(query.sortBy) ? query.sortBy : 'created_at';
    const sortDir: 'ASC' | 'DESC' = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`dispute.${sortBy}`, sortDir);

    // --- Pagination ---
    qb.skip(skip).take(limit);

    // Execute
    const [disputes, total] = await qb.getManyAndCount();

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

  async getUserDisputes(userId: string, page: number = 1, limit: number = 20, search: string = '') {
    const skip = ((Number(page) || 1) - 1) * limit;

    const qb = this.disputeRepository
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.order', 'order')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('order.seller', 'seller')
      .leftJoinAndSelect('dispute.raisedBy', 'raisedBy')
      .where(
        '(dispute.raisedById = :userId OR order.buyerId = :userId OR order.sellerId = :userId)',
        { userId }
      );

    if (search)
      qb.andWhere(
        'dispute.subject ILIKE :search',
        { search: `%${search}%` }
      );

    qb.orderBy('dispute.created_at', 'DESC').skip(skip).take(limit);


    const [disputes, total] = await qb.getManyAndCount();

    return {
      disputes,
      pagination: { page: Number(page) || 1, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getDispute(userId: string, userRole: string, disputeId: string) {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: ['order', 'raisedBy', 'order.buyer', 'order.seller'],
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    const user = await this.userRepository.findOne({ where: { id: userId } });

    const isInvolved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId;
    const hasPermission = PermissionBitmaskHelper.has(user.permissions.disputes, Permissions.Disputes.View);

    if ((user.role !== 'admin' || !hasPermission) && !isInvolved) throw new ForbiddenException('Access denied');

    return dispute;
  }

  async updateDisputeStatus(userId: string, userRole: string, disputeId: string, status: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const dispute = await this.getDispute(userId, user.role, disputeId);

    const hasPermission = PermissionBitmaskHelper.has(user.permissions.disputes, Permissions.Disputes.ChangeStatus);

    // Only admins can change to in_review / resolved / rejected
    if ((user.role !== 'admin' || !hasPermission) && status !== DisputeStatus.OPEN) {
      throw new ForbiddenException('Only administrators can change dispute status');
    }

    dispute.status = status as DisputeStatus;
    const saved = await this.disputeRepository.save(dispute);

    // Add a lightweight event & notify both parties
    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId } });
    if (order) {
      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', to: status, by: userId }];
      await this.orderRepository.save(order);

      const parties = [order.buyerId, order.sellerId];
      await this.notificationRepository.save(
        parties.map(
          pid =>
            this.notificationRepository.create({
              userId: pid,
              type: 'dispute_status',
              title: 'Dispute status updated',
              message: `Dispute status changed to "${status}" on order "${order.title}".`,
              relatedEntityType: 'dispute',
              relatedEntityId: disputeId,
            }) as any,
        ),
      );
    }

    return saved;
  }

  private async notify(userIds: string[], type: string, title: string, message: string, disputeId: string) {
    if (!userIds?.length) return;
    await this.notificationRepository.save(
      userIds.map(
        uid =>
          this.notificationRepository.create({
            userId: uid,
            type,
            title,
            message,
            relatedEntityType: 'dispute',
            relatedEntityId: disputeId,
          }) as any,
      ),
    );
  }

  private getAmountsFromBodyOrResolution(body: { sellerAmount?: number; buyerRefund?: number; note?: string }, dispute: Dispute) {
    const hasBody = typeof body?.sellerAmount === 'number' || typeof body?.buyerRefund === 'number';
    if (hasBody) {
      const sellerAmount = Number(body.sellerAmount || 0);
      const buyerRefund = Number(body.buyerRefund || 0);
      const note = body?.note || '';
      return { sellerAmount, buyerRefund, note };
    }
    const parsed = this.tryParse(dispute.resolution) || {};
    return {
      sellerAmount: Number(parsed.sellerAmount || 0),
      buyerRefund: Number(parsed.buyerRefund || 0),
      note: String(parsed.note || ''),
    };
  }

  // -----------------------
  // SMART STATUS ENDPOINT
  // -----------------------

  async updateDisputeStatusSmart(
    userId: string,
    userRole: string,
    disputeId: string,
    body: {
      status: 'open' | 'in_review' | 'resolved' | 'rejected' | 'closed_no_action';
      sellerAmount?: number;
      buyerRefund?: number;
      note?: string;
      closeAs?: 'completed' | 'cancelled';
      setResolutionOnly?: boolean;
    },
  ) {
    const restrictedNextStatuses = [
      DisputeStatus.RESOLVED,
      DisputeStatus.REJECTED,
      DisputeStatus.CLOSE_NO_ACTION,
    ];

    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: ['order', 'order.buyer', 'order.seller'],
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const order = dispute.order;
    const prev = dispute.status as DisputeStatus;
    const next = body.status as DisputeStatus;

    // Guard: only admin can set non-open statuses
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    const hasPermission = PermissionBitmaskHelper.has(user.permissions.disputes, Permissions.Disputes.ChangeStatus);

    if ((user.role !== 'admin' || !hasPermission) && next !== DisputeStatus.OPEN) {
      const isAccepting = next === DisputeStatus.RESOLVED && prev === DisputeStatus.IN_REVIEW && !!dispute.resolution && (order.buyerId === userId || order.sellerId === userId);
      if (!isAccepting) {
        throw new ForbiddenException('Only administrators can change dispute status');
      }
    }

    if (restrictedNextStatuses.includes(next)) {
      if (![DisputeStatus.OPEN, DisputeStatus.IN_REVIEW].includes(prev)) {
        throw new BadRequestException(
          `Dispute status "${next}" can only be set if the previous status is OPEN or IN_REVIEW.`
        );
      }
    }


    if (next === DisputeStatus.IN_REVIEW) {
      // If coming back from RESOLVED → IN_REVIEW, reverse funds first
      if (prev === DisputeStatus.RESOLVED) {
        await this.reverseIfResolved(dispute, userId);
      }

      // Optional: proposal included with this request (no payout)
      const hasProposal = typeof body?.sellerAmount === 'number' || typeof body?.buyerRefund === 'number' || body?.note;
      if (hasProposal) {
        dispute.resolution = JSON.stringify({
          sellerAmount: Number(body.sellerAmount || 0),
          buyerRefund: Number(body.buyerRefund || 0),
          note: body?.note || '',
        });
      }

      dispute.status = DisputeStatus.IN_REVIEW;
      await this.disputeRepository.save(dispute);

      // order state
      order.status = OrderStatus.DISPUTED;
      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];
      await this.orderRepository.save(order);

      await this.notify([order.buyerId, order.sellerId], 'dispute_status', 'Dispute status updated', `Dispute status changed to "in_review" on "${order.title}".`, dispute.id);

      return dispute;
    }

    if (next === DisputeStatus.OPEN) {
      // If going RESOLVED → OPEN, reverse funds first
      if (prev === DisputeStatus.RESOLVED) {
        await this.reverseIfResolved(dispute, userId);
      }
      dispute.status = DisputeStatus.OPEN;
      await this.disputeRepository.save(dispute);

      order.status = OrderStatus.DISPUTED;
      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];
      await this.orderRepository.save(order);

      await this.notify([order.buyerId, order.sellerId], 'dispute_status', 'Dispute status updated', `Dispute status changed to "open" on "${order.title}".`, dispute.id);

      return dispute;
    }

    if (next === DisputeStatus.RESOLVED) {
      const { sellerAmount, buyerRefund, note } = this.getAmountsFromBodyOrResolution(body, dispute);
      if (sellerAmount < 0 || buyerRefund < 0) throw new BadRequestException('Amounts must be >= 0');

      if (user.role !== 'admin' || !hasPermission) {
        if (prev !== DisputeStatus.IN_REVIEW || !dispute.resolution) {
          throw new ForbiddenException('Only admin can directly resolve without a pending resolution');
        }
      }

      if (user.role === 'admin' || hasPermission) {
        // Save/overwrite the proposed resolution if admin provided amounts
        if (typeof body?.sellerAmount === 'number' || typeof body?.buyerRefund === 'number' || body?.note) {
          dispute.resolution = JSON.stringify({ sellerAmount, buyerRefund, note });
        }
      }

      // 💸 Release from escrow
      const tx = await this.accountingService.releaseEscrowSplit(order.id, sellerAmount, buyerRefund);
      const { sellerPayoutTxId = null, buyerRefundTxId = null } = tx || {};

      dispute.status = DisputeStatus.RESOLVED;
      dispute.resolutionApplied = true;
      dispute.sellerPayoutTxId = sellerPayoutTxId;
      dispute.buyerRefundTxId = buyerRefundTxId;
      await this.disputeRepository.save(dispute);

      // Close order
      const closeAs = body?.closeAs || 'completed';
      order.status = closeAs === 'cancelled' ? OrderStatus.CANCELLED : OrderStatus.COMPLETED;
      if (closeAs !== 'cancelled') order.completedAt = new Date();
      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'payout_released', by: userId, sellerAmount, buyerRefund }, { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];
      await this.orderRepository.save(order);

      await this.notify([order.buyerId, order.sellerId], 'dispute_resolved', 'Dispute resolved', `The dispute on "${order.title}" was resolved.`, dispute.id);

      return dispute;
    }

    if (next === DisputeStatus.CLOSE_NO_ACTION) {
      if (user.role !== 'admin' || !hasPermission) throw new ForbiddenException('Only administrators can close dispute');

      dispute.status = DisputeStatus.CLOSE_NO_ACTION;
      await this.disputeRepository.save(dispute);

      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];

      order.status = OrderStatus.ACCEPTED;
      await this.orderRepository.save(order);

      await this.notify([order.buyerId, order.sellerId], 'dispute_status', 'Dispute status updated', `Dispute status changed to "close without action" on "${order.title}".`, dispute.id);

      return dispute;
    }

    if (next === DisputeStatus.REJECTED) {
      if (user.role !== 'admin' || !hasPermission) throw new ForbiddenException('Only administrators can reject');
      dispute.status = DisputeStatus.REJECTED;
      await this.disputeRepository.save(dispute);

      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];
      order.status = OrderStatus.ACCEPTED;
      await this.orderRepository.save(order);

      await this.notify([order.buyerId, order.sellerId], 'dispute_status', 'Dispute status updated', `Dispute status changed to "rejected" on "${order.title}".`, dispute.id);

      return dispute;
    }

    throw new BadRequestException('Unsupported status');
  }

  // Accept/admin propose — supports string JSON or structured body
  async proposeResolution(disputeId: string, body: any) {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: ['order', 'raisedBy', 'order.buyer', 'order.seller'],
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    let resolution: any;
    if (typeof body?.resolution === 'string') {
      resolution = this.tryParse(body.resolution);
    } else {
      resolution = { sellerAmount: Number(body?.sellerAmount || 0), buyerRefund: Number(body?.buyerRefund || 0), note: body?.note || '' };
    }

    // Optional: basic validation if we have invoice
    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId }, relations: ['invoices'] });
    const inv = order?.invoices?.[0];
    if (inv) {
      const subtotal = Number(inv.subtotal || 0);
      if (Number(((resolution.sellerAmount || 0) + (resolution.buyerRefund || 0)).toFixed(2)) !== Number(subtotal.toFixed(2))) {
        throw new BadRequestException('sellerAmount + buyerRefund must equal invoice subtotal');
      }
    }

    dispute.resolution = JSON.stringify(resolution);
    dispute.status = DisputeStatus.IN_REVIEW;
    const savedDispute = await this.disputeRepository.save(dispute);

    // Notify both parties
    const parties = [dispute.order.buyerId, dispute.order.sellerId];
    for (const partyId of parties) {
      const notification = this.notificationRepository.create({
        userId: partyId,
        type: 'dispute_resolution',
        title: 'Dispute resolution proposed',
        message: `A resolution has been proposed for dispute #${disputeId}.`,
        relatedEntityType: 'dispute',
        relatedEntityId: disputeId,
      } as any);
      await this.notificationRepository.save(notification);
    }

    return savedDispute;
  }

  private async reverseIfResolved(dispute: Dispute, actorId: string) {
    if (dispute.status !== DisputeStatus.RESOLVED || !dispute.resolutionApplied) return;

    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId } });
    if (!order) throw new NotFoundException('Order not found for dispute');

    const parsed = this.tryParse(dispute.resolution) || {};
    const sellerAmount = Number(parsed.sellerAmount || 0);
    const buyerRefund = Number(parsed.buyerRefund || 0);

    // Move funds back to platform escrow + wallet, and undo seller/buyer movements
    await this.accountingService.reverseResolution({
      orderId: order.id,
      sellerId: order.sellerId,
      buyerId: order.buyerId,
      sellerAmount,
      buyerRefund,
      sellerPayoutTxId: dispute.sellerPayoutTxId,
      buyerRefundTxId: dispute.buyerRefundTxId,
    });

    // Clear payout flags so we don't double-reverse
    dispute.resolutionApplied = false;
    dispute.sellerPayoutTxId = null;
    dispute.buyerRefundTxId = null;
    await this.disputeRepository.save(dispute);

    // Put order back into DISPUTED and log
    order.status = OrderStatus.DISPUTED;
    order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'payout_reversed', by: actorId }];
    await this.orderRepository.save(order);

    // Notify both parties
    await this.notify([order.buyerId, order.sellerId], 'dispute_reopened', 'Dispute reopened', `Funds were moved back to escrow for "${order.title}".`, dispute.id);
  }

  async rejectResolution(userId: string, disputeId: string) {
    const dispute = await this.getDispute(userId, 'user', disputeId);
    if (dispute.status !== DisputeStatus.IN_REVIEW) throw new BadRequestException('Resolution is not pending acceptance');

    dispute.status = DisputeStatus.OPEN;
    const saved = await this.disputeRepository.save(dispute);

    // notify platform
    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (platformUserId) {
      await this.notificationRepository.save(
        this.notificationRepository.create({
          userId: platformUserId,
          type: 'dispute_rejected',
          title: 'Resolution rejected',
          message: `A proposed resolution was rejected for dispute #${disputeId}.`,
          relatedEntityType: 'dispute',
          relatedEntityId: disputeId,
        }) as any,
      );
    }

    return saved;
  }

  async getDisputeStats() {
    const total = await this.disputeRepository.count();
    const open = await this.disputeRepository.count({ where: { status: DisputeStatus.OPEN } });
    const inReview = await this.disputeRepository.count({ where: { status: DisputeStatus.IN_REVIEW } });
    const resolved = await this.disputeRepository.count({ where: { status: DisputeStatus.RESOLVED } });
    const rejected = await this.disputeRepository.count({ where: { status: DisputeStatus.REJECTED } });
    return { total, open, inReview, resolved, rejected };
  }

  async acceptResolution(userId: string, disputeId: string) {
    const dispute = await this.getDispute(userId, 'user', disputeId);
    if (dispute.status !== DisputeStatus.IN_REVIEW) throw new BadRequestException('Resolution is not pending acceptance');
    const isInvolved = dispute.order.buyerId === userId || dispute.order.sellerId === userId;
    if (!isInvolved) throw new ForbiddenException('You are not involved in this dispute');

    let sellerAmount = 0,
      buyerRefund = 0;
    try {
      const parsed = JSON.parse(dispute.resolution || '{}');
      sellerAmount = Number(parsed.sellerAmount || 0);
      buyerRefund = Number(parsed.buyerRefund || 0);
    } catch {
      throw new BadRequestException('Resolution format invalid. Expected JSON with sellerAmount & buyerRefund.');
    }

    await this.accountingService.releaseEscrowSplit(dispute.orderId, sellerAmount, buyerRefund);

    dispute.status = DisputeStatus.RESOLVED;
    await this.disputeRepository.save(dispute);

    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId } });
    if (order && order.status !== OrderStatus.COMPLETED) {
      order.status = OrderStatus.COMPLETED;
      (order as any).completedAt = new Date();
      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_resolved', by: userId }];
      await this.orderRepository.save(order);
    }

    // notify buyer, seller, platform
    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;

    const notifs = [
      { userId: order.buyerId, title: 'Dispute resolved', message: `Resolution accepted for "${order.title}".` },
      { userId: order.sellerId, title: 'Dispute resolved', message: `Resolution accepted for "${order.title}".` },
    ];
    if (platformUserId) notifs.push({ userId: platformUserId, title: 'Dispute resolved', message: `Order "${order.title}" dispute was resolved.` });

    await this.notificationRepository.save(
      notifs.map(
        n =>
          this.notificationRepository.create({
            userId: n.userId,
            type: 'dispute_resolved',
            title: n.title,
            message: n.message,
            relatedEntityType: 'dispute',
            relatedEntityId: dispute.id,
          }) as any,
      ),
    );

    return dispute;
  }

  async getDisputeMessages(userId: string, userRole: string, disputeId: string, page: number = 1, limit: number = 50) {
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId }, relations: ['order'] });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const user: any = await this.userRepository.findOne({ where: { id: userId } });
    const hasPermission = PermissionBitmaskHelper.has(user.permissions.disputes, Permissions.Disputes.ChangeStatus);
    const involved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId || user?.role === 'admin' || hasPermission;
    if (!involved) throw new ForbiddenException('Access denied');

    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 50;
    const skip = (pageNumber - 1) * limitNumber;

    const [messages, total] = await this.dmRepo.findAndCount({
      where: { disputeId },
      relations: ['sender'],
      order: { created_at: 'ASC' },
      skip,
      take: limitNumber,
    });

    const mapped = messages.map(m => ({
      id: m.id,
      parentId: (m as any).parentId || null,
      sender: m.sender ? { id: m.sender.id, username: m.sender.username, profileImage: m.sender.profileImage } : { id: m.senderId },
      message: m.message,
      created_at: m.created_at,
    }));

    const pages = Math.max(1, Math.ceil(total / limitNumber));

    return {
      messages: mapped,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages,
      }
    };
  }

  // --- Admin: resolve and payout immediately (atomic)
  async resolveAndPayout(userId: string, userRole: string, disputeId: string, payload: { sellerAmount: number; buyerRefund: number; note?: string; closeAs: 'completed' | 'cancelled' }) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    const hasPermission = PermissionBitmaskHelper.has(user.permissions.disputes, Permissions.Disputes.Propose);

    if (user.role !== 'admin' || !hasPermission) throw new ForbiddenException('Only administrators can resolve & payout');
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId }, relations: ['order'] });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId }, relations: ['invoices'] });
    const inv = order?.invoices?.[0];
    if (!inv) throw new BadRequestException('No invoice found for this order');

    const subtotal = Number(inv.subtotal || 0);
    const sAmt = Number(payload.sellerAmount || 0);
    const bRef = Number(payload.buyerRefund || 0);
    if (sAmt < 0 || bRef < 0) throw new BadRequestException('Amounts must be ≥ 0');
    if (Number((sAmt + bRef).toFixed(2)) !== Number(subtotal.toFixed(2))) {
      throw new BadRequestException('sellerAmount + buyerRefund must equal invoice subtotal');
    }

    await this.dataSource.transaction(async manager => {
      // release escrow
      await this.accountingService.releaseEscrowSplit(dispute.orderId, sAmt, bRef);

      // close dispute
      dispute.status = DisputeStatus.RESOLVED;
      dispute.resolution = JSON.stringify({ sellerAmount: sAmt, buyerRefund: bRef, note: payload.note || '', decidedBy: 'admin' });
      dispute.resolutionApplied = true;
      await manager.getRepository(Dispute).save(dispute);

      // update order
      if (payload.closeAs === 'completed') {
        order.status = OrderStatus.COMPLETED;
        (order as any).completedAt = new Date();


        // Update seller stats inside transaction
        const seller = await manager.getRepository(User).findOne({ where: { id: order.sellerId } });
        if (seller) {
          seller.ordersCompleted = (seller.ordersCompleted || 0) + 1;

          const previousOrders = await manager.getRepository(Order).count({
            where: {
              sellerId: seller.id,
              buyerId: order.buyerId,
              status: OrderStatus.COMPLETED,
              id: Not(order.id),
            },
          });

          if (previousOrders === 0) {
            seller.repeatBuyers = (seller.repeatBuyers || 0) + 1;
          }

          await manager.getRepository(User).save(seller);
        }

      } else {
        order.status = OrderStatus.CANCELLED; // ensure this exists in your enum
        (order as any).cancelledAt = new Date();
      }
      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_resolved_admin', by: userId, payload }];
      await manager.getRepository(Order).save(order);

      // notify parties
      const notifs = [
        { userId: order.buyerId, title: 'Dispute resolved', message: `Admin resolved dispute on "${order.title}".` },
        { userId: order.sellerId, title: 'Dispute resolved', message: `Admin resolved dispute on "${order.title}".` },
      ];
      await manager.getRepository(Notification).save(
        notifs.map(
          n =>
            manager.getRepository(Notification).create({
              userId: n.userId,
              type: 'dispute_resolved',
              title: n.title,
              message: n.message,
              relatedEntityType: 'dispute',
              relatedEntityId: dispute.id,
            }) as any,
        ),
      );
    });

    return { ok: true, id: disputeId, status: DisputeStatus.RESOLVED };
  }
}
