import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuthService } from 'src/auth/auth.service';


@Injectable()
export class ResponseTimeUpdaterService {
    private readonly logger = new Logger(ResponseTimeUpdaterService.name);

    constructor(private authService: AuthService) { }

    // Runs every 24 hours at 2:00 AM
    @Cron('0 0 2 * * *')
    async updateResponseTimesDaily() {
        this.logger.log('Starting daily response-time update...');

        try {
            // Example logic: recalc average response time for every user
            await this.authService.updateResponseTimes();

            this.logger.log('Daily response-time update completed.');
        } catch (error) {
            this.logger.error('Error updating response times', error);
        }
    }

}