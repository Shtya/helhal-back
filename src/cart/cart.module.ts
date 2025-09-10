import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart, CartItem, Service, User } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem, Service, User])],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}