import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdatePaymentEntities1769695862989 implements MigrationInterface {
    name = 'UpdatePaymentEntities1769695862989'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa"`);
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_1f8d1173481678a035b4a81a4ec"`);
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_e496e4036539498a56034834325"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_652419b4e4717ce9c426832c211"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_cbc0edc8462e5ab9a964670a2d0"`);
        await queryRunner.query(`ALTER TABLE "user_balances" RENAME COLUMN "credits" TO "promo_credits"`);
        await queryRunner.query(`CREATE TABLE "platform_wallet" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "totalEscrowBalance" numeric(15,2) NOT NULL DEFAULT '0', "platformProfit" numeric(15,2) NOT NULL DEFAULT '0', "currency" character varying(3) NOT NULL DEFAULT 'SAR', CONSTRAINT "PK_412946f93793ab2c5036bdfae24" PRIMARY KEY ("id"))`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d741f8e462d538929cc5162c1"`);
        await queryRunner.query(`ALTER TABLE "persons" ALTER COLUMN "countryCode" SET DEFAULT '{"code":"SA","dial_code":"+966"}'`);
        await queryRunner.query(`ALTER TYPE "public"."invoices_paymentstatus_enum" RENAME TO "invoices_paymentstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."invoices_paymentstatus_enum" AS ENUM('pending', 'paid', 'failed', 'refunded')`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" TYPE "public"."invoices_paymentstatus_enum" USING "paymentStatus"::"text"::"public"."invoices_paymentstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."invoices_paymentstatus_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."payments_status_enum" RENAME TO "payments_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'completed', 'failed', 'rejected', 'refund_pending', 'refund_completed', 'refund_failed')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum" USING "status"::"text"::"public"."payments_status_enum"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_type_enum" AS ENUM('escrow_deposit', 'escrow_release', 'refund', 'refund_reversal', 'earning', 'earning_reversal', 'withdrawal', 'commission', 'commission_withdrawal', 'referral_credit')`);
        await queryRunner.query(`
        ALTER TABLE "transactions" 
        ALTER COLUMN "type" TYPE "public"."transactions_type_enum" 
        USING ("type"::text::"public"."transactions_type_enum")
    `);
        await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum" AS ENUM('pending', 'completed', 'failed', 'rejected', 'refund_pending', 'refund_completed', 'refund_failed')`);
        await queryRunner.query(`
        ALTER TABLE "transactions" 
        ALTER COLUMN "status" TYPE "public"."transactions_status_enum" 
        USING ("status"::text::"public"."transactions_status_enum")
    `);
        await queryRunner.query(`ALTER TABLE "persons" ALTER COLUMN "countryCode" SET DEFAULT '{"code":"SA","dial_code":"+966"}'`);
        await queryRunner.query(`ALTER TYPE "public"."invoices_paymentstatus_enum" RENAME TO "invoices_paymentstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."invoices_paymentstatus_enum" AS ENUM('pending', 'paid', 'failed', 'refunded')`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" TYPE "public"."invoices_paymentstatus_enum" USING "paymentStatus"::"text"::"public"."invoices_paymentstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."invoices_paymentstatus_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."payments_status_enum" RENAME TO "payments_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'completed', 'failed', 'rejected', 'refund_pending', 'refund_completed', 'refund_failed')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum" USING "status"::"text"::"public"."payments_status_enum"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum_old"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8d741f8e462d538929cc5162c1" ON "persons" ("phone", "countryCode") WHERE "phone" IS NOT NULL AND "phone" != '' AND "countryCode" IS NOT NULL AND "countryCode" != '{}'`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_1f8d1173481678a035b4a81a4ec" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_e496e4036539498a56034834325" FOREIGN KEY ("subcategory_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_652419b4e4717ce9c426832c211" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_cbc0edc8462e5ab9a964670a2d0" FOREIGN KEY ("subcategory_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_saved_cards" ADD CONSTRAINT "FK_963765cd9eff953e0a667cb1f95" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_saved_cards" DROP CONSTRAINT "FK_963765cd9eff953e0a667cb1f95"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_cbc0edc8462e5ab9a964670a2d0"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_652419b4e4717ce9c426832c211"`);
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_e496e4036539498a56034834325"`);
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_1f8d1173481678a035b4a81a4ec"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d741f8e462d538929cc5162c1"`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum_old" AS ENUM('completed', 'failed', 'pending', 'refunded')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum_old" USING "status"::"text"::"public"."payments_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."payments_status_enum_old" RENAME TO "payments_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."invoices_paymentstatus_enum_old" AS ENUM('failed', 'paid', 'pending')`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" TYPE "public"."invoices_paymentstatus_enum_old" USING "paymentStatus"::"text"::"public"."invoices_paymentstatus_enum_old"`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."invoices_paymentstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."invoices_paymentstatus_enum_old" RENAME TO "invoices_paymentstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "persons" ALTER COLUMN "countryCode" SET DEFAULT '{"code": "SA", "dial_code": "+966"}'`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "status" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "type" character varying NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum_old" AS ENUM('completed', 'failed', 'pending', 'refunded')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum_old" USING "status"::"text"::"public"."payments_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."payments_status_enum_old" RENAME TO "payments_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."invoices_paymentstatus_enum_old" AS ENUM('failed', 'paid', 'pending')`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" TYPE "public"."invoices_paymentstatus_enum_old" USING "paymentStatus"::"text"::"public"."invoices_paymentstatus_enum_old"`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "paymentStatus" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."invoices_paymentstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."invoices_paymentstatus_enum_old" RENAME TO "invoices_paymentstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "persons" ALTER COLUMN "countryCode" SET DEFAULT '{"code": "SA", "dial_code": "+966"}'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8d741f8e462d538929cc5162c1" ON "persons" ("phone", "countryCode") WHERE ((phone IS NOT NULL) AND ((phone)::text <> ''::text) AND ("countryCode" IS NOT NULL) AND ("countryCode" <> '{}'::jsonb))`);
        await queryRunner.query(`DROP TABLE "platform_wallet"`);
        await queryRunner.query(`ALTER TABLE "user_balances" RENAME COLUMN "promo_credits" TO "credits"`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_cbc0edc8462e5ab9a964670a2d0" FOREIGN KEY ("subcategory_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_652419b4e4717ce9c426832c211" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_e496e4036539498a56034834325" FOREIGN KEY ("subcategory_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_1f8d1173481678a035b4a81a4ec" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
