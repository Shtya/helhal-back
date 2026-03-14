import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { Dispute, Order, User, Notification, DisputeStatus, OrderStatus, Setting, DisputeMessage } from 'entities/global.entity';
import { AccountingService } from 'src/accounting/accounting.service';
import { PermissionBitmaskHelper } from 'src/auth/permission-bitmask.helper';
import { Permissions } from 'entities/permissions';
import { TranslationService } from 'common/translation.service';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute) private disputeRepository: Repository<Dispute>,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(DisputeMessage) private dmRepo: Repository<DisputeMessage>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    private notificationService: NotificationService,
    private accountingService: AccountingService,
    private dataSource: DataSource,
    private i18n: TranslationService,
  ) { }

  async createDispute(userId: string, createDisputeDto: any) {
    const { orderId, reason, type, subject } = createDisputeDto;

    const order = await this.orderRepository.findOne({
      where: { id: orderId }, relations: {
        buyer: {
          person: true // Fetches person details for the buyer
        },
        seller: {
          person: true // Fetches person details for the seller
        }
      }
    });

    if (!order) {
      throw new NotFoundException(this.i18n.t('events.order_not_found'));
    }
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException(this.i18n.t('events.dispute_access_denied'));
    }
    if (![OrderStatus.ACCEPTED, OrderStatus.DELIVERED, OrderStatus.ChangeRequested].includes(order.status)) throw new BadRequestException(this.i18n.t('events.disputes.invalid_order_state'));


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

    // 1. Notify the counterparty (Buyer or Seller)
    await this.notificationService.notifyWithLang({
      userIds: [otherUserId],
      type: 'dispute_opened',
      title: { key: 'events.disputes.opened_title' },
      message: {
        key: 'events.disputes.opened_msg',
        args: { title: order.title, reason }
      },
      relatedEntityId: savedDispute.id,
      relatedEntityType: 'dispute'
    });

    // 2. Notify the Platform Admin
    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;

    if (platformUserId) {
      await this.notificationService.notifyWithLang({
        userIds: [platformUserId],
        type: 'dispute_opened',
        title: { key: 'events.disputes.new_dispute_title' },
        message: {
          key: 'events.disputes.new_dispute_msg',
          args: { title: order.title }
        },
        relatedEntityId: savedDispute.id,
        relatedEntityType: 'dispute'
      });
    }

    return savedDispute;
  }

  async getActivity(userId: string, userRole: string, disputeId: string) {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: {
        raisedBy: {
          person: true // Profile of the person who opened the dispute
        },
        order: {
          buyer: {
            person: true // Profile of the buyer
          },
          seller: {
            person: true // Profile of the seller
          }
        }
      },
    });

    if (!dispute) throw new BadRequestException(this.i18n.t('events.dispute_not_found'));
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException(this.i18n.t('events.disputes.user_not_found'));

    const hasPermission = PermissionBitmaskHelper.has(user.permissions?.disputes, Permissions.Disputes.Chat);

    const involved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId || user.role === 'admin' || hasPermission;
    if (!involved) throw new BadRequestException(this.i18n.t('events.access_denied'));

    // order + invoice
    const order = await this.orderRepository.findOne({
      where: { id: dispute.orderId },
      relations: {
        buyer: {
          person: true // Fetches person details for the buyer
        },
        seller: {
          person: true // Fetches person details for the seller
        },
        invoices: true
      }
    });
    const invoice = order?.invoices?.[0] || null;

    // messages (threaded) - limit to 50 for activity view
    const [messages, total] = await this.dmRepo.findAndCount({
      where: { disputeId },
      relations: {
        sender: {
          person: true
        }
      },
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
          sellerServiceFee: invoice.sellerServiceFee,
          totalAmount: invoice.totalAmount,
          platformPercent: invoice.platformPercent,
        }
        : null,
      messages: messages.map(m => ({
        id: m.id,
        parentId: (m as any).parentId || null,
        sender: m.sender ? { id: m.sender.id, username: m.sender.username, profileImage: m.sender.profileImage, role: m.sender?.role } : { id: m.senderId },
        message: m.message,
        created_at: m.created_at,
      })),
      hasMore: total > messages.length,
      events,
    };
  }

  async postMessage(userId: string, userRole: string, disputeId: string, message: string, parentId?: string) {
    const text = (message || '').trim();
    if (!text) {
      throw new BadRequestException(this.i18n.t('events.message_required'));
    }
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId }, relations: ['order'] });
    if (!dispute) throw new BadRequestException(this.i18n.t('events.dispute_not_found'));

    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    const hasPermission = PermissionBitmaskHelper.has(user.permissions?.disputes, Permissions.Disputes.Chat);

    const involved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId || user?.role === 'admin' || hasPermission;
    if (!involved) throw new BadRequestException(this.i18n.t('events.access_denied'));

    if ([DisputeStatus.RESOLVED, DisputeStatus.REJECTED].includes(dispute.status)) {
      throw new BadRequestException(this.i18n.t('events.dispute_closed_error'));
    }

    if (parentId) {
      const parent = await this.dmRepo.findOne({ where: { id: parentId, disputeId } });
      if (!parent) {
        throw new BadRequestException(this.i18n.t('events.parent_message_not_found'));
      }
    }

    const dm = this.dmRepo.create({ disputeId, senderId: userId, message: text, ...(parentId ? { parentId } : {}) } as any);
    const saved: any = await this.dmRepo.save(dm);

    // notify the other side
    const recipientIds = new Set<string>();
    if (dispute.order.buyerId !== userId) recipientIds.add(dispute.order.buyerId);
    if (dispute.order.sellerId !== userId) recipientIds.add(dispute.order.sellerId);

    // Convert the Set to an array for the service
    const recipients = Array.from(recipientIds);

    if (recipients.length > 0) {
      await this.notificationService.notifyWithLang({
        userIds: recipients,
        type: 'dispute_message',
        title: {
          key: 'events.disputes.new_message_title'
        },
        message: text.slice(0, 2000),
        relatedEntityId: disputeId,
        relatedEntityType: 'dispute'
      });
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
      .leftJoinAndSelect('raisedBy.person', 'rbp')

      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('buyer.person', 'bp')

      .leftJoinAndSelect('order.seller', 'seller')
      .leftJoinAndSelect('seller.person', 'sp')

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
      .leftJoinAndSelect('buyer.person', 'bp')      // Join Buyer's Person details

      .leftJoinAndSelect('order.seller', 'seller')
      .leftJoinAndSelect('seller.person', 'sp')     // Join Seller's Person details

      .leftJoinAndSelect('dispute.raisedBy', 'raisedBy')
      .leftJoinAndSelect('raisedBy.person', 'rp')
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

  async getDispute(userId: string, disputeId: string, manager?: EntityManager) {
    const disputeRepo = manager ? manager.getRepository(Dispute) : this.disputeRepository;
    const userRepo = manager ? manager.getRepository(User) : this.userRepository;
    const dispute = await disputeRepo.findOne({
      where: { id: disputeId },
      relations: {
        raisedBy: {
          person: true // Profile of the person who opened the dispute
        },
        order: {
          buyer: {
            person: true // Profile of the buyer
          },
          seller: {
            person: true // Profile of the seller
          }
        }
      },
    });
    if (!dispute) throw new BadRequestException(this.i18n.t('events.dispute_not_found'));
    const user = await userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    const isInvolved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId;
    const hasPermission = PermissionBitmaskHelper.has(user.permissions?.disputes, Permissions.Disputes.View);

    if (!(user.role === 'admin' || hasPermission || !isInvolved)) throw new BadRequestException(this.i18n.t('events.access_denied'));

    return dispute;
  }

  async updateDisputeStatus(userId: string, userRole: string, disputeId: string, status: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    const dispute = await this.getDispute(userId, disputeId);

    const hasPermission = PermissionBitmaskHelper.has(user.permissions?.disputes, Permissions.Disputes.ChangeStatus);

    // Only admins can change to in_review / resolved / rejected
    if (status === DisputeStatus.OPEN && !(user.role === 'admin' || hasPermission)) {
      throw new ForbiddenException(this.i18n.t('events.only_admin_change_status'));
    }
    dispute.status = status as DisputeStatus;
    const saved = await this.disputeRepository.save(dispute);

    // Add a lightweight event & notify both parties
    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId } });
    if (order) {
      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', to: status, by: userId }];
      await this.orderRepository.save(order);

      await this.notificationService.notifyWithLang({
        userIds: [order.buyerId, order.sellerId],
        type: 'dispute_status',
        title: {
          key: 'events.disputes.status_updated_title'
        },
        message: {
          key: 'events.disputes.status_updated_msg',
          args: { status, title: order.title }
        },
        relatedEntityId: disputeId,
        relatedEntityType: 'dispute'
      });
    }

    return saved;
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
    return await this.dataSource.transaction(async (manager) => {
      const restrictedNextStatuses = [
        DisputeStatus.IN_REVIEW,
        DisputeStatus.RESOLVED,
        DisputeStatus.REJECTED,
        DisputeStatus.CLOSE_NO_ACTION,
      ];


      const dispute = await manager.findOne(Dispute, {
        where: { id: disputeId },
        relations: {
          order: {
            buyer: {
              person: true // Buyer profile data
            },
            seller: {
              person: true // Seller profile data
            }
          }
        },
      });
      if (!dispute) throw new BadRequestException(this.i18n.t('events.dispute_not_found'));

      const order = dispute.order;
      const prev = dispute.status as DisputeStatus;
      const next = body.status as DisputeStatus;

      // Guard: only admin can set non-open statuses
      const user = await this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.person', 'person')
        .addSelect('person.permissions')
        .where('user.id = :id', { id: userId })
        .getOne();

      const hasPermission = PermissionBitmaskHelper.has(user.permissions?.disputes, Permissions.Disputes.ChangeStatus);
      if (!(user.role === 'admin' || hasPermission)) {
        throw new ForbiddenException(this.i18n.t('events.admin_only_status_change'));
      }

      if (!restrictedNextStatuses.includes(next)) {
        throw new BadRequestException(
          this.i18n.t('events.invalid_dispute_status', { args: { status: next } })
        );
      }

      if ([DisputeStatus.RESOLVED, DisputeStatus.REJECTED, DisputeStatus.CLOSE_NO_ACTION].includes(next)) {
        if (![DisputeStatus.OPEN, DisputeStatus.IN_REVIEW].includes(prev)) {
          throw new BadRequestException(
            this.i18n.t('events.dispute_status_transition_error', { args: { next } })
          );
        }
      }

      if (next === DisputeStatus.IN_REVIEW && prev !== DisputeStatus.OPEN) {
        throw new BadRequestException(this.i18n.t('events.dispute_in_review_error'));
      }

      if (next === DisputeStatus.IN_REVIEW) {
        // If coming back from RESOLVED → IN_REVIEW, reverse funds first

        // Optional: proposal included with this request (no payout)
        // const hasProposal = typeof body?.sellerAmount === 'number' || typeof body?.buyerRefund === 'number' || body?.note;
        // if (hasProposal) {
        //   dispute.resolution = JSON.stringify({
        //     sellerAmount: Number(body.sellerAmount || 0),
        //     buyerRefund: Number(body.buyerRefund || 0),
        //     note: body?.note || '',
        //   });
        // }

        dispute.status = DisputeStatus.IN_REVIEW;
        await manager.save(dispute);

        // order state
        order.status = OrderStatus.DISPUTED;
        order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];
        await manager.save(order);

        await this.notificationService.notifyWithLang({
          userIds: [order.buyerId, order.sellerId],
          type: 'dispute_status',
          title: {
            key: 'events.disputes.status_updated_title'
          },
          message: {
            key: 'events.disputes.status_in_review_msg',
            args: { title: order.title }
          },
          relatedEntityId: dispute.id,
          relatedEntityType: 'dispute',
          manager
        });
        return dispute;
      }

      if (next === DisputeStatus.OPEN) {
        // If going RESOLVED → OPEN, reverse funds first
        dispute.status = DisputeStatus.OPEN;
        await manager.save(dispute);

        order.status = OrderStatus.DISPUTED;
        order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];
        await manager.save(order);

        await this.notificationService.notifyWithLang({
          userIds: [order.buyerId, order.sellerId],
          type: 'dispute_status',
          title: {
            key: 'events.disputes.status_updated_title'
          },
          message: {
            key: 'events.disputes.status_open_msg',
            args: { title: order.title }
          },
          relatedEntityId: dispute.id,
          relatedEntityType: 'dispute',
          manager
        });

        return dispute;
      }

      if (next === DisputeStatus.RESOLVED) {
        const { sellerAmount, buyerRefund, note } = this.getAmountsFromBodyOrResolution(body, dispute);
        if (sellerAmount < 0 || buyerRefund < 0) throw new BadRequestException(this.i18n.t('events.invoice_mismatch'));

        if (!(user.role === 'admin' || hasPermission)) {
          if (prev !== DisputeStatus.IN_REVIEW || !dispute.resolution) {
            throw new ForbiddenException(this.i18n.t('events.admin_resolve_required'));
          }
        }

        if (user.role === 'admin' || hasPermission) {
          // Save/overwrite the proposed resolution if admin provided amounts
          if (typeof body?.sellerAmount === 'number' || typeof body?.buyerRefund === 'number' || body?.note) {
            dispute.resolution = JSON.stringify({ sellerAmount, buyerRefund, note });
          }
        }

        // 💸 Release from escrow
        const tx = await this.accountingService.releaseEscrowSplit(order.id, sellerAmount, buyerRefund, manager);
        const { sellerPayoutTxId = null, buyerRefundTxId = null } = tx || {};

        dispute.status = DisputeStatus.RESOLVED;
        dispute.resolutionApplied = true;
        dispute.sellerPayoutTxId = sellerPayoutTxId;
        dispute.buyerRefundTxId = buyerRefundTxId;
        await manager.save(dispute);

        // Close order
        const closeAs = body?.closeAs || 'completed';
        order.status = closeAs === 'cancelled' ? OrderStatus.CANCELLED : OrderStatus.COMPLETED;
        if (closeAs !== 'cancelled') order.completedAt = new Date();
        order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'payout_released', by: userId, sellerAmount, buyerRefund }, { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];
        await manager.save(order);

        await this.notificationService.notifyWithLang({
          userIds: [order.buyerId, order.sellerId],
          type: 'dispute_resolved',
          title: {
            key: 'events.disputes.resolved_title'
          },
          message: {
            key: 'events.disputes.resolved_msg',
            args: { title: order.title }
          },
          relatedEntityId: dispute.id,
          relatedEntityType: 'dispute',
          manager
        });
        return dispute;
      }

      if (next === DisputeStatus.CLOSE_NO_ACTION) {
        if (!(user.role === 'admin' || hasPermission)) throw new ForbiddenException(this.i18n.t('events.admin_only_close'));

        dispute.status = DisputeStatus.CLOSE_NO_ACTION;
        await manager.save(dispute);

        order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];

        order.status = OrderStatus.ACCEPTED;
        await manager.save(order);

        await this.notificationService.notifyWithLang({
          userIds: [order.buyerId, order.sellerId],
          type: 'dispute_status',
          title: {
            key: 'events.disputes.status_updated_title'
          },
          message: {
            key: 'events.disputes.status_close_no_action_msg',
            args: { title: order.title }
          },
          relatedEntityId: dispute.id,
          relatedEntityType: 'dispute',
          manager
        });

        return dispute;
      }

      if (next === DisputeStatus.REJECTED) {

        dispute.status = DisputeStatus.REJECTED;
        await manager.save(dispute);

        order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_status', from: prev, to: next, by: userId }];
        order.status = OrderStatus.ACCEPTED;
        await manager.save(order);
        await this.notificationService.notifyWithLang({
          userIds: [order.buyerId, order.sellerId],
          type: 'dispute_status',
          title: {
            key: 'events.disputes.status_updated_title'
          },
          message: {
            key: 'events.disputes.status_rejected_msg',
            args: { title: order.title }
          },
          relatedEntityId: dispute.id,
          relatedEntityType: 'dispute',
          manager
        });

        return dispute;
      }

      throw new BadRequestException(this.i18n.t('events.unsupported_status'));
    });
  }

  // Accept/admin propose — supports string JSON or structured body
  async proposeResolution(disputeId: string, body: any) {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: {
        raisedBy: {
          person: true // Profile of the user who initiated the dispute
        },
        order: {
          buyer: {
            person: true // Buyer's profile data
          },
          seller: {
            person: true // Seller's profile data
          }
        }
      },
    });
    if (!dispute) throw new BadRequestException(this.i18n.t('events.dispute_not_found'));

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
        throw new BadRequestException(this.i18n.t('events.invoice_mismatch'));
      }
    }

    dispute.resolution = JSON.stringify(resolution);
    dispute.status = DisputeStatus.IN_REVIEW;
    const savedDispute = await this.disputeRepository.save(dispute);

    await this.notificationService.notifyWithLang({
      userIds: [dispute.order.buyerId, dispute.order.sellerId],
      type: 'dispute_resolution',
      title: {
        key: 'events.disputes.resolution_proposed_title'
      },
      message: {
        key: 'events.disputes.resolution_proposed_msg',
        args: { id: disputeId }
      },
      relatedEntityId: disputeId,
      relatedEntityType: 'dispute'
    });

    return savedDispute;
  }

  // private async reverseIfResolved(dispute: Dispute, actorId: string) {
  //   if (dispute.status !== DisputeStatus.RESOLVED || !dispute.resolutionApplied) return;

  //   const order = await this.orderRepository.findOne({ where: { id: dispute.orderId } });
  //   if (!order) throw new NotFoundException('Order not found for dispute');

  //   const parsed = this.tryParse(dispute.resolution) || {};
  //   const sellerAmount = Number(parsed.sellerAmount || 0);
  //   const buyerRefund = Number(parsed.buyerRefund || 0);

  //   // Move funds back to platform escrow + wallet, and undo seller/buyer movements
  //   await this.accountingService.reverseResolution({
  //     orderId: order.id,
  //     sellerId: order.sellerId,
  //     buyerId: order.buyerId,
  //     sellerAmount,
  //     buyerRefund,
  //     sellerPayoutTxId: dispute.sellerPayoutTxId,
  //     buyerRefundTxId: dispute.buyerRefundTxId,
  //   });

  //   // Clear payout flags so we don't double-reverse
  //   dispute.resolutionApplied = false;
  //   dispute.sellerPayoutTxId = null;
  //   dispute.buyerRefundTxId = null;
  //   await this.disputeRepository.save(dispute);

  //   // Put order back into DISPUTED and log
  //   order.status = OrderStatus.DISPUTED;
  //   order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'payout_reversed', by: actorId }];
  //   await this.orderRepository.save(order);

  //   // Notify both parties
  //   await this.notify([order.buyerId, order.sellerId], 'dispute_reopened', 'Dispute reopened', `Funds were moved back to escrow for "${order.title}".`, dispute.id);
  // }

  async rejectResolution(userId: string, disputeId: string) {
    const dispute = await this.getDispute(userId, disputeId);
    if (dispute.status !== DisputeStatus.IN_REVIEW) throw new BadRequestException(this.i18n.t('events.resolution_not_pending'));

    dispute.status = DisputeStatus.REJECTED;
    const saved = await this.disputeRepository.save(dispute);

    // notify platform
    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (platformUserId) {
      await this.notificationService.notifyWithLang({
        userIds: [platformUserId],
        type: 'dispute_rejected',
        title: {
          key: 'events.disputes.resolution_rejected_title'
        },
        message: {
          key: 'events.disputes.resolution_rejected_msg',
          args: { id: disputeId }
        },
        relatedEntityId: disputeId,
        relatedEntityType: 'dispute'
      });
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
    return await this.dataSource.transaction(async (manager) => {
      const dispute = await this.getDispute(userId, disputeId, manager);
      if (dispute.status !== DisputeStatus.IN_REVIEW) throw new BadRequestException(this.i18n.t('events.resolution_not_pending'));
      const isInvolved = dispute.order.buyerId === userId || dispute.order.sellerId === userId;
      if (!isInvolved) throw new ForbiddenException(this.i18n.t('events.user_not_involved'));

      let sellerAmount = 0,
        buyerRefund = 0;
      try {
        const parsed = JSON.parse(dispute.resolution || '{}');
        sellerAmount = Number(parsed.sellerAmount || 0);
        buyerRefund = Number(parsed.buyerRefund || 0);
      } catch {
        throw new BadRequestException(this.i18n.t('events.invalid_resolution_format'));
      }

      await this.accountingService.releaseEscrowSplit(dispute.orderId, sellerAmount, buyerRefund, manager);

      dispute.status = DisputeStatus.RESOLVED;
      await manager.save(dispute);

      const order = await manager.findOne(Order, { where: { id: dispute.orderId } });
      if (order && order.status !== OrderStatus.COMPLETED) {
        order.status = OrderStatus.COMPLETED;
        (order as any).completedAt = new Date();
        order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_resolved', by: userId }];
        await manager.save(order);
      }

      // notify buyer, seller, platform
      const settings = await manager.find(Setting, { take: 1, order: { created_at: 'DESC' } });
      const platformUserId = settings?.[0]?.platformAccountUserId;

      // 1. Notify Buyer and Seller (Same Message)
      await this.notificationService.notifyWithLang({
        userIds: [order.buyerId, order.sellerId],
        type: 'dispute_resolved',
        title: { key: 'events.disputes.resolved_title' },
        message: {
          key: 'events.disputes.resolution_accepted_msg',
          args: { title: order.title }
        },
        relatedEntityId: dispute.id,
        relatedEntityType: 'dispute',
        manager // Keep it inside the resolution transaction
      });

      // 2. Notify Platform User / Admin if exists (Different Message)
      if (platformUserId) {
        await this.notificationService.notifyWithLang({
          userIds: [platformUserId],
          type: 'dispute_resolved',
          title: { key: 'events.disputes.resolved_title' },
          message: {
            key: 'events.disputes.order_resolved_msg',
            args: { title: order.title }
          },
          relatedEntityId: dispute.id,
          relatedEntityType: 'dispute',
          manager
        });
      }

      return dispute;
    });
  }

  async getDisputeMessages(userId: string, userRole: string, disputeId: string, page: number = 1, limit: number = 50) {
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId }, relations: ['order'] });
    if (!dispute) throw new BadRequestException(this.i18n.t('events.dispute_not_found'));

    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    const hasPermission = PermissionBitmaskHelper.has(user.permissions?.disputes, Permissions.Disputes.ChangeStatus);
    const involved = dispute.order.buyerId === userId || dispute.order.sellerId === userId || dispute.raisedById === userId || user?.role === 'admin' || hasPermission;
    if (!involved) throw new BadRequestException(this.i18n.t('events.access_denied'));

    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 50;
    const skip = (pageNumber - 1) * limitNumber;

    const [messages, total] = await this.dmRepo.findAndCount({
      where: { disputeId },
      relations: {
        sender: {
          person: true
        }
      },
      order: { created_at: 'ASC' },
      skip,
      take: limitNumber,
    });

    const mapped = messages.map(m => ({
      id: m.id,
      parentId: (m as any).parentId || null,
      sender: m.sender ? { id: m.sender.id, username: m.sender.username, profileImage: m.sender.profileImage, role: m.sender?.role } : { id: m.senderId },
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


    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();
    const hasPermission = PermissionBitmaskHelper.has(user.permissions?.disputes, Permissions.Disputes.Propose);

    if (!(user.role === 'admin' || hasPermission)) throw new ForbiddenException(this.i18n.t('events.dispute_access_denied'));
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId }, relations: ['order'] });
    if (!dispute) throw new BadRequestException(this.i18n.t('events.dispute_not_found'));

    const order = await this.orderRepository.findOne({ where: { id: dispute.orderId }, relations: ['invoices'] });
    const inv = order?.invoices?.[0];
    if (!inv) throw new BadRequestException(this.i18n.t('events.disputes.no_invoice'));

    const subtotal = Number(inv.subtotal || 0);
    const sAmt = Number(payload.sellerAmount || 0);
    const bRef = Number(payload.buyerRefund || 0);
    if (sAmt < 0 || bRef < 0) throw new BadRequestException(this.i18n.t('events.invoice_mismatch'));
    if (Number((sAmt + bRef).toFixed(2)) !== Number(subtotal.toFixed(2))) {
      throw new BadRequestException(this.i18n.t('events.invoice_mismatch'));
    }

    await this.dataSource.transaction(async manager => {
      // release escrow
      await this.accountingService.releaseEscrowSplit(dispute.orderId, sAmt, bRef, manager);

      // close dispute
      dispute.status = DisputeStatus.RESOLVED;
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

        await this.sendRatingNotifications(order, manager)

      } else {
        order.status = OrderStatus.CANCELLED; // ensure this exists in your enum
        (order as any).cancelledAt = new Date();
      }
      order.timeline = [...(order.timeline || []), { at: new Date().toISOString(), type: 'dispute_resolved_admin', by: userId, payload }];
      await manager.getRepository(Order).save(order);

      // notify parties
      await this.notificationService.notifyWithLang({
        userIds: [order.buyerId, order.sellerId],
        type: 'dispute_resolved',
        title: {
          key: 'events.disputes.resolved_title'
        },
        message: {
          key: 'events.disputes.admin_resolved_msg',
          args: { title: order.title }
        },
        relatedEntityId: dispute.id,
        relatedEntityType: 'dispute',
        manager // Crucial to maintain the transaction context
      });
    });

    return { ok: true, id: disputeId, status: DisputeStatus.RESOLVED };
  }

  // Helper: Send notifications to both parties to rate each other
  private async sendRatingNotifications(order: Order, manager: EntityManager) {
    // Since buyer and seller usually have different message keys for ratings,
    // we call the service for each to ensure the specific 'buyer_msg' vs 'seller_msg' logic.

    // 1. Notify Buyer
    await this.notificationService.notifyWithLang({
      userIds: [order.buyerId],
      type: 'rating',
      title: { key: 'events.disputes.rating_buyer_title' },
      message: {
        key: 'events.disputes.rating_buyer_msg',
        args: { title: order.title }
      },
      relatedEntityId: order.id,
      relatedEntityType: 'order',
      manager
    });

    // 2. Notify Seller
    await this.notificationService.notifyWithLang({
      userIds: [order.sellerId],
      type: 'rating',
      title: { key: 'events.disputes.rating_seller_title' },
      message: {
        key: 'events.disputes.rating_seller_msg',
        args: { title: order.title }
      },
      relatedEntityId: order.id,
      relatedEntityType: 'order',
      manager
    });
  }
}
