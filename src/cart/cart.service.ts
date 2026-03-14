import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem, Service, User } from 'entities/global.entity';
import { TranslationService } from 'common/translation.service';

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
    private readonly i18n: TranslationService, // حقن خدمة الترجمة
  ) { }

  async getUserCart(userId: string) {
    let cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items', 'items.service'],
    });

    if (!cart) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(this.i18n.t('events.cart.errors.user_not_found'));
      }

      cart = this.cartRepository.create({ userId, user });
      await this.cartRepository.save(cart);
    }

    return {
      id: cart.id,
      userId: userId,
      items: cart?.items?.map((item) => item.service),
      total: cart?.items?.length || 0,
    };
  }

  async toggleCartItem(userId: string, serviceId: string) {
    const service = await this.serviceRepository.findOne({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundException(this.i18n.t('events.cart.errors.service_not_found'));
    }

    let cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      cart = this.cartRepository.create({ userId, user });
      await this.cartRepository.save(cart);
    }

    let item = cart.items?.find((i) => i.serviceId === serviceId);

    if (item) {
      await this.cartItemRepository.remove(item);
      return {
        action: 'removed',
        message: this.i18n.t('events.cart.messages.removed'),
        service
      };
    }

    item = this.cartItemRepository.create({ cartId: cart.id, serviceId });
    await this.cartItemRepository.save(item);
    return {
      action: 'added',
      message: this.i18n.t('events.cart.messages.added'),
      service
    };
  }

  async removeCartItem(userId: string, serviceId: string) {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      throw new NotFoundException(this.i18n.t('events.cart.errors.cart_not_found'));
    }

    const item = cart.items?.find((i) => i.serviceId === serviceId);
    if (!item) {
      throw new NotFoundException(this.i18n.t('events.cart.errors.service_not_in_cart'));
    }

    await this.cartItemRepository.remove(item);
    return { message: this.i18n.t('events.cart.messages.removed') };
  }

  async clearCart(userId: string) {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (cart?.items?.length) {
      await this.cartItemRepository.remove(cart.items);
    }

    return { message: this.i18n.t('events.cart.messages.cleared') };
  }
}