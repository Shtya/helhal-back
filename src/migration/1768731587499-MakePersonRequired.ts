import { MigrationInterface, QueryRunner } from "typeorm";

export class MakePersonRequired1768731587499 implements MigrationInterface {
    name = 'MakePersonRequired1768731587499'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_8d741f8e462d538929cc5162c1"`);
        await queryRunner.query(`ALTER TABLE "persons" ALTER COLUMN "countryCode" SET DEFAULT '{"code":"SA","dial_code":"+966"}'`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_5ed72dcd00d6e5a88c6a6ba3d18"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "person_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "persons" ALTER COLUMN "countryCode" SET DEFAULT '{"code":"SA","dial_code":"+966"}'`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "person_id" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8d741f8e462d538929cc5162c1" ON "persons" ("phone", "countryCode") WHERE "phone" IS NOT NULL AND "phone" != '' AND "countryCode" IS NOT NULL AND "countryCode" != '{}'`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_5ed72dcd00d6e5a88c6a6ba3d18" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3`, ["VIEW", "user_view", "public"]);
        await queryRunner.query(`DROP VIEW "user_view"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_5ed72dcd00d6e5a88c6a6ba3d18"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d741f8e462d538929cc5162c1"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "person_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "persons" ALTER COLUMN "countryCode" SET DEFAULT '{"code": "SA", "dial_code": "+966"}'`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "person_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_5ed72dcd00d6e5a88c6a6ba3d18" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8d741f8e462d538929cc5162c1" ON "persons" ("phone", "countryCode") WHERE ((phone IS NOT NULL) AND ((phone)::text <> ''::text) AND ("countryCode" IS NOT NULL) AND ("countryCode" <> '{}'::jsonb))`);
    }

}
