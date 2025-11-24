import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem, Service, User, PackageType } from 'entities/global.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private cartItemRepository: Repository<CartItem>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) { }


  async getUserCart(userId: string) {
    let cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items', 'items.service'],
    });

    if (!cart) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      cart = this.cartRepository.create({ userId, user });
      await this.cartRepository.save(cart);
    }

    return {
      id: cart.id,
      items: cart?.items?.map(item => item.service),
      total: cart?.items?.length || 0
    }
  }

  async toggleCartItem(userId: string, serviceId: string) {
    // Fetch the service
    const service = await this.serviceRepository.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Service not found');

    // Fetch or create cart
    let cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      cart = this.cartRepository.create({ userId, user });
      await this.cartRepository.save(cart);
    }

    // Check if item exists in cart
    let item = cart.items?.find(i => i.serviceId === serviceId);

    if (item) {
      // Remove from cart
      await this.cartItemRepository.remove(item);
      return { action: 'removed', service };
    }

    // Add to cart
    item = this.cartItemRepository.create({ cartId: cart.id, serviceId });
    await this.cartItemRepository.save(item);
    return { action: 'added', service };
  }


  async removeCartItem(userId: string, serviceId: string) {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) throw new NotFoundException('Cart not found');

    const item = cart.items?.find(i => i.serviceId === serviceId);
    if (!item) throw new NotFoundException('Service not in cart');

    await this.cartItemRepository.remove(item);
    return { message: 'Removed from cart' };
  }

  async clearCart(userId: string) {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (cart?.items?.length) {
      await this.cartItemRepository.remove(cart.items);
    }

    return { message: 'Cart cleared successfully' };
  }
}