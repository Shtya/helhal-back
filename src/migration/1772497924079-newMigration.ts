import { MigrationInterface, QueryRunner } from "typeorm";

export class NewMigration1772497924079 implements MigrationInterface {
    name = 'NewMigration1772497924079'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" ADD "external_order_id" character varying`);
        await queryRunner.query(`DROP INDEX "public"."IDX_person_phone_country"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_person_phone_country" ON "persons" ("phone", "countryCode") WHERE ((phone IS NOT NULL) AND ((phone)::text <> ''::text) AND ("countryCode" IS NOT NULL) AND ("countryCode" <> '{}'::jsonb))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_person_phone_country"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_person_phone_country" ON "persons" ("phone", "countryCode") WHERE ((phone IS NOT NULL) AND ((phone)::text <> ''::text) AND ("countryCode" IS NOT NULL) AND ("countryCode" <> '{}'::jsonb))`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "external_order_id"`);
    }

}
