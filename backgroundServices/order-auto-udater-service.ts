import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { OrdersService } from "src/orders/orders.service";

@Injectable()
export class OrderAutoUpdaterService {
    private readonly logger = new Logger(OrderAutoUpdaterService.name);

    constructor(private readonly ordersService: OrdersService) { }
    // Run every day at 12:00 AM
    @Cron('0 0 0 * * *')
    async processDelayedOrders() {
        this.logger.log('Checking for delayed orders...');

        try {
            const delayedOrders = await this.ordersService.getDelayedOrders();

            for (const { order, action } of delayedOrders) {
                try {

                    if (action === 'complete') {
                        await this.ordersService.autoComplete(order.id);
                        this.logger.log(`Order ${order.id} marked as COMPLETED`);
                    } else if (action === 'cancel') {
                        await this.ordersService.autoCancel(order.id);
                        this.logger.log(`Order ${order.id} marked as CANCELLED`);
                    }
                } catch (err) {
                    this.logger.error(
                        `Failed to process order ${order.id} for action ${action}`,
                        err.stack || err
                    );
                }
            }

            this.logger.log(`Processed ${delayedOrders.length} delayed orders`);
        } catch (err) {
            this.logger.error('Error processing delayed orders', err);
        }
    }
}
