import { Injectable, BadRequestException } from '@nestjs/common';
import { RedisService } from './RedisService';
import { console } from 'inspector';


@Injectable()
export class IdempotencyService {
    constructor(private readonly redisService: RedisService) { }

    async runWithIdempotency<T>(
        key: string,
        handler: () => Promise<T>,
        ttl = 0, // Changed to 0: No result storage by default
        lockttl = 10, // s-  default lock TTL 10 seconds
        timeout = 10000, //ms - default wait timeout 10 seconds
    ): Promise<T> {
        const resultKey = `result:${key}`;
        const lockKey = `lock:${key}`;

        // Check if result already cached
        const cachedResult = await this.redisService.get(resultKey);
        if (cachedResult) {
            return cachedResult;
        }

        // Try to acquire lock atomically (SET NX PX)
        const acquired = await this.redisService.setNxWithTtl(lockKey, 'locked', lockttl);
        // 👆 10s lock TTL to prevent deadlocks
        if (!acquired) {
            // Another request is in-flight, wait for result
            return new Promise<T>((resolve, reject) => {
                const interval = setInterval(async () => {
                    const result = await this.redisService.get(resultKey);
                    if (result) {
                        clearInterval(interval);
                        resolve(result);
                    }
                }, 100);

                setTimeout(() => {
                    clearInterval(interval);
                    reject(
                        new BadRequestException(
                            'Request already in-flight, try again later',
                        ),
                    );
                }, timeout); // timeout after 5s
            });
        }

        try {
            const result = await handler();
            if (ttl > 0) {
                await this.redisService.set(resultKey, result, ttl);
            }
            return result;
        } finally {
            await this.redisService.del(lockKey);
        }
    }
}
