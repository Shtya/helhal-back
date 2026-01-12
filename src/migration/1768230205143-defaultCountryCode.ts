import { MigrationInterface, QueryRunner } from "typeorm";

export class DefaultCountryCode1768230205143 implements MigrationInterface {
    name = 'DefaultCountryCode1768230205143'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c8fe6cfe9bef772cdf3f2e317f"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "countryCode" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "countryCode" SET DEFAULT '{"code":"SA","dial_code":"+966"}'`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "countryCode" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "countryCode" SET DEFAULT '{"code":"SA","dial_code":"+966"}'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c8fe6cfe9bef772cdf3f2e317f" ON "users" ("phone", "countryCode") WHERE "phone" IS NOT NULL AND "phone" != '' AND "countryCode" IS NOT NULL AND "countryCode" != '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c8fe6cfe9bef772cdf3f2e317f"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "countryCode" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "countryCode" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "countryCode" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "countryCode" DROP NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c8fe6cfe9bef772cdf3f2e317f" ON "users" ("phone", "countryCode") WHERE ((phone IS NOT NULL) AND ((phone)::text <> ''::text) AND ("countryCode" IS NOT NULL) AND ("countryCode" <> '{}'::jsonb))`);
    }

}
