import { Controller, Get, Post, Body, Param, UseGuards, Req, Query, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { AccessGuard } from 'src/auth/guard/access.guard';
import { UserRole } from 'entities/global.entity';
import { RequireAccess } from 'decorators/access.decorator';
import { CRUD } from 'common/crud.service';
import { Permissions } from 'entities/permissions';
import { BillingInfoDto, PAYMENT_TIMING, UnifiedCheckout } from 'src/payments/base/payment.constant';
import { IdempotencyService } from 'common/IdempotencyService';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private ordersService: OrdersService,
    private readonly idempotencyService: IdempotencyService,
  ) { }


  @Get()
  async getOrders(@Req() req, @Query() query: any) {
    return this.ordersService.getOrdersForUser(req.user.id, query);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'orders',
      value: Permissions.Orders.View
    }
  })
  async getOrdersAdmin(@Query('') query: any) {
    return CRUD.findAll(this.ordersService.orderRepository, 'order', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['buyer', 'seller', 'service', 'invoices'], ['title'], { status: query.status == 'all' ? '' : query.status });
  }


  @Get('invoices')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'invoices',
      value: Permissions.Invoices.View
    }
  })
  async getOrdersInvoices(@Query() query: any) {
    return this.ordersService.getInvoices(query);
  }


  @Post('admin/finalize-payment')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'orders',
      value: Permissions.Orders.MarkAsPayout
    }
  })
  @RequireAccess({
    roles: [UserRole.ADMIN]
  })
  async adminFinalizeOrder(
    @Body('orderId') orderId: string,
  ) {
    return await this.ordersService.adminManualFinalize(orderId);
  }

  @Post(':orderId/pay')
  @UseGuards(JwtAuthGuard)
  async payOrder(
    @Param('orderId') orderId: string,
    @Body() billingInfo: BillingInfoDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;

    // Prepare the unified DTO
    const checkoutDto: UnifiedCheckout = {
      userId,
      billingInfo,
    };
    const idempotencyKey = `${userId}-${orderId}`;
    // The service now handles the logic based on the method
    return this.idempotencyService.runWithIdempotency(
      idempotencyKey,
      () => this.ordersService.processOrderPayment(checkoutDto, orderId),
      PAYMENT_TIMING.CACHE_TTL,
      PAYMENT_TIMING.LOCK_TTL,
      PAYMENT_TIMING.TIMEOUT_MS,
    );
  }
  @Get(':id')
  async getOrder(@Req() req, @Param('id') id: string) {
    return this.ordersService.getOrder(req.user.id, req.user.role, id, req);
  }

  @Post("checkout")
  async createOrderCheckout(@Req() req, @Body() createOrderDto: any) {
    const { order, paymentUrl } = await this.ordersService.createOrderCheckout(req.user.id, createOrderDto);
    return { order, paymentUrl };
  }

  @Post()
  async createOrder(@Req() req, @Body() createOrderDto: any) {
    return this.ordersService.createOrder(req.user.id, createOrderDto);
  }

  // @Put(':id/status')
  // async updateOrderStatus(@Req() req, @Param('id') id: string, @Body() body: { status: string }) {
  //   return this.ordersService.updateOrderStatus(req.user.id, req.user.role, id, body.status, req);
  // }

  @Post(':id/deliver')
  async deliverOrder(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { message?: string; files?: { filename: string; url: string }[] },
  ) {
    return this.ordersService.deliverOrder(req.user.id, id, body, req);
  }

  @Get(':id/last-submission')
  async getLastSubmission(@Req() req, @Param('id') orderId: string) {
    return this.ordersService.getLastSubmission(req.user.id, orderId);
  }

  @Post(':id/request-changes')
  async requestChanges(
    @Req() req,
    @Param('id') orderId: string,
    @Body() body: { message?: string; files?: { filename: string; url: string }[]; },
  ) {
    return this.ordersService.createChangeRequest(req.user.id, orderId, body, req);
  }

  @Get(':id/last-change-request')
  async lastChangeRequest(@Req() req, @Param('id') orderId: string) {
    return this.ordersService.changeRequest(req.user.id, orderId);
  }

  @Post(':id/complete')
  async completeOrder(@Req() req, @Param('id') id: string) {
    return this.ordersService.completeOrder(req.user.id, id, req);
  }

  @Post(':id/cancel')
  async cancelOrder(@Req() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.ordersService.cancelOrder(req.user.id, req.user.role, id, req, body.reason);
  }

  @Post(':id/accept')
  async acceptOrder(@Req() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.ordersService.acceptOrder(req.user.id, req.user.role, id, req, body.reason);
  }

  @Post(':id/reject')
  async rejectOrder(@Req() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.ordersService.rejectOrder(req.user.id, req.user.role, id, req, body.reason);
  }
}
