import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { CartService } from './cart.service';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private cartService: CartService) { }

  @Get()
  async getCart(@Req() req) {
    return this.cartService.getUserCart(req.user.id);
  }

  @Post('item/:serviceId/toggle')
  async toggleCartItem(@Req() req, @Param('serviceId') serviceId: string) {
    return this.cartService.toggleCartItem(req.user.id, serviceId);
  }

  @Delete('item/:serviceId')
  async removeCartItem(@Req() req, @Param('serviceId') serviceId: string) {
    return this.cartService.removeCartItem(req.user.id, serviceId);
  }

  @Delete()
  async clearCart(@Req() req) {
    return this.cartService.clearCart(req.user.id);
  }
}