import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, Order, OrderRating, Service, User } from 'entities/global.entity';
import { RatingsController } from './rating.controller';
import { RatingsAutoUpdaterService } from 'backgroundServices/ratings-auto-updater-service';
import { RatingsService } from './rating.service';


@Module({
    imports: [
        TypeOrmModule.forFeature([OrderRating, Order, User, Service, Notification]),
    ],
    controllers: [RatingsController],
    providers: [RatingsService, RatingsAutoUpdaterService],
    exports: [RatingsService],
})
export class RatingsModule { }