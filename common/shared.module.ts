import { Module } from "@nestjs/common";
import { IdempotencyService } from "./IdempotencyService";
import { RedisService } from "./RedisService";
import { ConfigModule } from "@nestjs/config";
import redisConfig from "./config/redis.config";


@Module({
    imports: [
        ConfigModule.forFeature(redisConfig),
    ],
    providers: [RedisService, IdempotencyService],
    exports: [RedisService, IdempotencyService], // 👈 export both
})
export class SharedModule { }

