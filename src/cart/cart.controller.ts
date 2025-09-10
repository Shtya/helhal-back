import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { CartService } from './cart.service';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  async getCart(@Req() req) {
    return this.cartService.getUserCart(req.user.id);
  }

  @Post('item')
  async addToCart(@Req() req, @Body() addToCartDto: any) {
    return this.cartService.addToCart(req.user.id, addToCartDto);
  }

  @Put('item/:itemId')
  async updateCartItem(@Req() req, @Param('itemId') itemId: string, @Body() updateCartItemDto: any) {
    return this.cartService.updateCartItem(req.user.id, itemId, updateCartItemDto);
  }

  @Delete('item/:itemId')
  async removeFromCart(@Req() req, @Param('itemId') itemId: string) {
    return this.cartService.removeFromCart(req.user.id, itemId);
  }

  @Delete()
  async clearCart(@Req() req) {
    return this.cartService.clearCart(req.user.id);
  }
}