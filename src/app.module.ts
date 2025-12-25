import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import { join } from 'path';
import { LoggingValidationPipe } from 'common/translationPipe';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiController } from './app.controller';
import { QueryFailedErrorFilter } from 'common/QueryFailedErrorFilter';
import { AssetModule } from './asset/asset.module';
import { AuthModule } from './auth/auth.module';
import { PassportModule } from '@nestjs/passport';
import { RecommendationModule } from './recommendation/recommendation.module';
import { SettingsModule } from './settings/settings.module';
import { NotificationModule } from './notification/notification.module';
import { CategoriesModule } from './categories/categories.module';
import { ServicesModule } from './services/services.module';
import { ServiceRequirementsModule } from './service-requirements/service-requirements.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { FavoritesModule } from './favorites/favorites.module';
import { CartModule } from './cart/cart.module';
import { ConversationsModule } from './conversations/conversations.module';
import { SavedSearchesModule } from './saved-searches/saved-searches.module';
import { AbuseReportsModule } from './abuse-reports/abuse-reports.module';
import { DisputesModule } from './disputes/disputes.module';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';
import { AccountingModule } from './accounting/accounting.module';
import { ReferralModule } from './referral/referral.module';
import { ReportsModule } from './reports/reports.module';
import { JobsModule } from './jobs/jobs.module';
import { BlogsModule } from './blogs/blogs.module';
import { BlogCategoriesModule } from './blog-categories/blog-categories.module';
import { InviteModule } from './invite/invite.module';
import { NotificationSubscriber } from './notification/NotificationSubscriber';
import { Notification } from 'entities/global.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { ResponseTimeUpdaterService } from 'backgroundServices/response-time-updater.service';
import { OrderAutoUpdaterService } from 'backgroundServices/order-auto-udater-service';
import { DashboardModule } from './dashboard/dashboard.module';
import { CacheModule } from '@nestjs/cache-manager';
import { StatesModule } from './states/states.module';
import { CountriesModule } from './countries/countries.module';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Notification]),
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT, 10),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: false,

    }),
    PassportModule,

    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRE },
    }),

    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: join(__dirname, '/../i18n/'),
        watch: true,
      },
      resolvers: [{ use: QueryResolver, options: ['lang'] }, new HeaderResolver(['x-lang'])],
    }),

    AuthModule,
    AssetModule,

    CategoriesModule,
    ServicesModule,

    JobsModule,

    RecommendationModule,
    SettingsModule,
    NotificationModule,
    ServiceRequirementsModule,
    OrdersModule,
    PaymentsModule,
    ReviewsModule,
    FavoritesModule,
    CartModule,
    ConversationsModule,
    SavedSearchesModule,
    AbuseReportsModule,
    DisputesModule,
    SupportTicketsModule,
    AccountingModule,
    ReferralModule,
    ReportsModule,
    BlogsModule,
    BlogCategoriesModule,
    CountriesModule,
    StatesModule,
    InviteModule,
    DashboardModule
  ],
  controllers: [ApiController],
  providers: [LoggingValidationPipe, QueryFailedErrorFilter, NotificationSubscriber, ResponseTimeUpdaterService, OrderAutoUpdaterService],
  exports: [LoggingValidationPipe],
})
export class AppModule { }
