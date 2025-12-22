import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, Query, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { AccessGuard } from 'src/auth/guard/access.guard';
import { UserRole } from 'entities/global.entity';
import { RequireAccess } from 'decorators/access.decorator';
import { CRUD } from 'common/crud.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) { }

  @Get('admin')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN] })
  async getOrdersAdmin(@Query('') query: any) {
    return CRUD.findAll(this.ordersService.orderRepository, 'order', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['buyer', 'seller', 'service', 'invoices'], ['title'], { status: query.status == 'all' ? '' : query.status });
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({ roles: [UserRole.ADMIN] })
  async getOrdersInvoices(@Query() query: any) {
    return this.ordersService.getInvoices(query);
  }


  @Get()
  async getOrders(@Req() req, @Query() query: any) {
    return this.ordersService.getOrdersForUser(req.user.id, query);
  }


  @Post(':orderId/mark-paid')
  @UseGuards(JwtAuthGuard)
  async markOrderPaid(@Param('orderId') orderId: string, @Req() req: any) {
    const userId = req.user.id;
    const out = await this.ordersService.markOrderPaid(orderId, userId);
    if (!out) throw new NotFoundException('Order not found');
    return out;
  }

  @Get(':id')
  async getOrder(@Req() req, @Param('id') id: string) {
    return this.ordersService.getOrder(req.user.id, req.user.role, id);
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

  @Put(':id/status')
  async updateOrderStatus(@Req() req, @Param('id') id: string, @Body() body: { status: string }) {
    return this.ordersService.updateOrderStatus(req.user.id, req.user.role, id, body.status);
  }

  @Post(':id/deliver')
  async deliverOrder(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { message?: string; files?: { filename: string; url: string }[] },
  ) {
    return this.ordersService.deliverOrder(req.user.id, id, body);
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
    return this.ordersService.createChangeRequest(req.user.id, orderId, body);
  }

  @Get(':id/last-change-request')
  async lastChangeRequest(@Req() req, @Param('id') orderId: string) {
    return this.ordersService.changeRequest(req.user.id, orderId);
  }

  @Post(':id/complete')
  async completeOrder(@Req() req, @Param('id') id: string) {
    return this.ordersService.completeOrder(req.user.id, id);
  }

  @Post(':id/cancel')
  async cancelOrder(@Req() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.ordersService.cancelOrder(req.user.id, req.user.role, id, body.reason);
  }
}
