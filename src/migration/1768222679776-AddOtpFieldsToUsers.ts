import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOtpFieldsToUsers1768222679776 implements MigrationInterface {
    name = 'AddOtpFieldsToUsers1768222679776'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_21c6898e5497faf3f6e85eb4134"`);
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_ed7bad27f677a50dbabdae30594"`);
        await queryRunner.query(`CREATE TYPE "public"."pending_phone_registrations_role_enum" AS ENUM('buyer', 'seller', 'admin')`);
        await queryRunner.query(`CREATE TABLE "pending_phone_registrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "phone" character varying NOT NULL, "countryCode" jsonb NOT NULL, "otpCode" character varying NOT NULL, "otpExpiresAt" TIMESTAMP NOT NULL, "otpLastSentAt" TIMESTAMP NOT NULL, "referralCodeUsed" character varying, "role" "public"."pending_phone_registrations_role_enum" NOT NULL DEFAULT 'buyer', "type" character varying NOT NULL DEFAULT 'Business', CONSTRAINT "PK_48365d52f144066376970b1792c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2e997b0a0b63cb7b10ad7257bd" ON "pending_phone_registrations" ("phone", "countryCode") WHERE "phone" IS NOT NULL AND "phone" != '' AND "countryCode" IS NOT NULL AND "countryCode" != '{}'`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "freelanceTop"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "freelanceTopIconUrl"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "otpCode" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "otpLastSentAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "otpExpiresAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "search_vector" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "services" RENAME COLUMN "search_vector" TO "TEMP_OLD_search_vector"`);
        await queryRunner.query(`ALTER TABLE "services" ADD "search_vector" tsvector`);
        await queryRunner.query(`UPDATE "services" SET "search_vector" = "TEMP_OLD_search_vector"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "TEMP_OLD_search_vector"`);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","search_vector","HelHal","public","services"]);
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "search_vector" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "jobs" RENAME COLUMN "search_vector" TO "TEMP_OLD_search_vector"`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "search_vector" tsvector`);
        await queryRunner.query(`UPDATE "jobs" SET "search_vector" = "TEMP_OLD_search_vector"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "TEMP_OLD_search_vector"`);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","search_vector","HelHal","public","jobs"]);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "search_vector" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "services" RENAME COLUMN "search_vector" TO "TEMP_OLD_search_vector"`);
        await queryRunner.query(`ALTER TABLE "services" ADD "search_vector" tsvector`);
        await queryRunner.query(`UPDATE "services" SET "search_vector" = "TEMP_OLD_search_vector"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "TEMP_OLD_search_vector"`);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","search_vector","HelHal","public","services"]);
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "search_vector" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "jobs" RENAME COLUMN "search_vector" TO "TEMP_OLD_search_vector"`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "search_vector" tsvector`);
        await queryRunner.query(`UPDATE "jobs" SET "search_vector" = "TEMP_OLD_search_vector"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "TEMP_OLD_search_vector"`);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","search_vector","HelHal","public","jobs"]);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c8fe6cfe9bef772cdf3f2e317f" ON "users" ("phone", "countryCode") WHERE "phone" IS NOT NULL AND "phone" != '' AND "countryCode" IS NOT NULL AND "countryCode" != '{}'`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_21c6898e5497faf3f6e85eb4134" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_ed7bad27f677a50dbabdae30594" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_ed7bad27f677a50dbabdae30594"`);
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_21c6898e5497faf3f6e85eb4134"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c8fe6cfe9bef772cdf3f2e317f"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_vector"`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || 
    setweight(to_tsvector('arabic', normalize_arabic(coalesce(description, ''))), 'B') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED NOT NULL`);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`, ["HelHal","public","jobs","GENERATED_COLUMN","search_vector","\n    setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || \n    setweight(to_tsvector('arabic', normalize_arabic(coalesce(description, ''))), 'B') ||\n    setweight(to_tsvector('english', coalesce(title, '')), 'A') || \n    setweight(to_tsvector('english', coalesce(description, '')), 'B')\n  "]);
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "search_vector" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "search_vector"`);
        await queryRunner.query(`ALTER TABLE "services" ADD "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || 
    setweight(to_tsvector('arabic', normalize_arabic(coalesce(brief, ''))), 'B') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
    setweight(to_tsvector('english', coalesce(brief, '')), 'B')
  ) STORED NOT NULL`);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`, ["HelHal","public","services","GENERATED_COLUMN","search_vector","\n    setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || \n    setweight(to_tsvector('arabic', normalize_arabic(coalesce(brief, ''))), 'B') ||\n    setweight(to_tsvector('english', coalesce(title, '')), 'A') || \n    setweight(to_tsvector('english', coalesce(brief, '')), 'B')\n  "]);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "search_vector" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_vector"`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || 
    setweight(to_tsvector('arabic', normalize_arabic(coalesce(description, ''))), 'B') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED NOT NULL`);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`, ["HelHal","public","jobs","GENERATED_COLUMN","search_vector","\n    setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || \n    setweight(to_tsvector('arabic', normalize_arabic(coalesce(description, ''))), 'B') ||\n    setweight(to_tsvector('english', coalesce(title, '')), 'A') || \n    setweight(to_tsvector('english', coalesce(description, '')), 'B')\n  "]);
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "search_vector" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "search_vector"`);
        await queryRunner.query(`ALTER TABLE "services" ADD "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || 
    setweight(to_tsvector('arabic', normalize_arabic(coalesce(brief, ''))), 'B') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
    setweight(to_tsvector('english', coalesce(brief, '')), 'B')
  ) STORED NOT NULL`);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`, ["HelHal","public","services","GENERATED_COLUMN","search_vector","\n    setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || \n    setweight(to_tsvector('arabic', normalize_arabic(coalesce(brief, ''))), 'B') ||\n    setweight(to_tsvector('english', coalesce(title, '')), 'A') || \n    setweight(to_tsvector('english', coalesce(brief, '')), 'B')\n  "]);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "search_vector" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otpExpiresAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otpLastSentAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otpCode"`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "freelanceTopIconUrl" character varying`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "freelanceTop" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2e997b0a0b63cb7b10ad7257bd"`);
        await queryRunner.query(`DROP TABLE "pending_phone_registrations"`);
        await queryRunner.query(`DROP TYPE "public"."pending_phone_registrations_role_enum"`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_ed7bad27f677a50dbabdae30594" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_21c6898e5497faf3f6e85eb4134" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
