import { Module } from '@nestjs/common';
import { SavedSearchesService } from './saved-searches.service';
import { SavedSearchesController } from './saved-searches.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedSearch, Service, User, Notification } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavedSearch, Service, User, Notification])],
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService],
})
export class SavedSearchesModule {}