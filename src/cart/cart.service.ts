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
  ) {}

  async getUserCart(userId: string) {
    let cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items', 'items.service'],
    });

    if (!cart) {
      // Create a new cart if it doesn't exist
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      cart = this.cartRepository.create({ userId, user });
      await this.cartRepository.save(cart);
    }

    // Calculate total
    let total = 0;
    if (cart.items) {
      cart.items.forEach(item => {
        total += item.priceSnapshot * item.quantity;
      });
    }

    return {
      ...cart,
      total,
    };
  }

  async addToCart(userId: string, addToCartDto: any) {
    const { serviceId, packageType, quantity = 1, extraServices = [] } = addToCartDto;

    const service = await this.serviceRepository.findOne({
      where: { id: serviceId, status: 'Active' },
    } as any);

    if (!service) {
      throw new NotFoundException('Service not found or not available');
    }

    // Get user cart
    let cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      cart = this.cartRepository.create({ userId, user });
      await this.cartRepository.save(cart);
    }

    // Check if item already exists in cart
    const existingItem = cart.items?.find(item => 
      item.serviceId === serviceId && item.packageType === packageType
    );

    if (existingItem) {
      // Update quantity if item exists
      existingItem.quantity += quantity;
      return this.cartItemRepository.save(existingItem);
    }

    // Get package price
    const packageData = service.packages.find((pkg: any) => pkg.name === packageType);
    if (!packageData) {
      throw new NotFoundException('Package type not found');
    }

    // Create new cart item
    const cartItem = this.cartItemRepository.create({
      cartId: cart.id,
      serviceId,
      packageType,
      quantity,
      priceSnapshot: packageData.price,
      extraServices,
    });

    return this.cartItemRepository.save(cartItem);
  }

  async updateCartItem(userId: string, itemId: string, updateCartItemDto: any) {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = cart.items?.find(item => item.id === itemId);
    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    Object.assign(cartItem, updateCartItemDto);
    return this.cartItemRepository.save(cartItem);
  }

  async removeFromCart(userId: string, itemId: string) {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = cart.items?.find(item => item.id === itemId);
    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    return this.cartItemRepository.remove(cartItem);
  }

  async clearCart(userId: string) {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    if (cart.items && cart.items.length > 0) {
      await this.cartItemRepository.remove(cart.items);
    }

    return { message: 'Cart cleared successfully' };
  }
}