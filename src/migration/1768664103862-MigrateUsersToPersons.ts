import { MigrationInterface, QueryRunner } from "typeorm";

export class MigrateUsersToPersons1768664103862 implements MigrationInterface {
    name = 'MigrateUsersToPersons1768664103862'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_a78a00605c95ca6737389f6360b"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_ae78dc6cb10aa14cfef96b2dd90"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c8fe6cfe9bef772cdf3f2e317f"`);
        await queryRunner.query(`CREATE TYPE "public"."persons_status_enum" AS ENUM('active', 'suspended', 'pending_verification', 'deleted', 'inactive')`);
        await queryRunner.query(`CREATE TABLE "persons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "username" character varying NOT NULL, "email" character varying, "pendingEmail" character varying, "pendingEmailCode" character varying, "lastEmailChangeSentAt" TIMESTAMP, "password" character varying, "type" character varying NOT NULL, "phone" character varying, "countryCode" jsonb NOT NULL DEFAULT '{"code":"SA","dial_code":"+966"}', "isPhoneVerified" boolean NOT NULL DEFAULT false, "last_login" TIMESTAMP WITH TIME ZONE, "devices" jsonb NOT NULL DEFAULT '[]', "googleId" character varying, "appleId" character varying, "resetPasswordToken" character varying, "lastResetPasswordSentAt" TIMESTAMP, "resetPasswordExpires" TIMESTAMP, "otpCode" character varying, "otpLastSentAt" TIMESTAMP, "otpExpiresAt" TIMESTAMP, "referralCode" character varying, "referred_by_id" uuid, "referralCount" integer NOT NULL DEFAULT '0', "referralRewardsCount" integer NOT NULL DEFAULT '0', "languages" jsonb NOT NULL DEFAULT '[]', "country_id" uuid, "permissions" jsonb, "status" "public"."persons_status_enum" NOT NULL DEFAULT 'active', "deactivated_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_f3d65ff899495b6a52e9e336c3d" UNIQUE ("username"), CONSTRAINT "UQ_928155276ca8852f3c440cc2b2c" UNIQUE ("email"), CONSTRAINT "UQ_86d3424ad5b2959d3562dc8b58c" UNIQUE ("googleId"), CONSTRAINT "UQ_7144836bf33fc6804c2b5b5d4ed" UNIQUE ("appleId"), CONSTRAINT "UQ_6768803c9c565baaa43e35dc9b1" UNIQUE ("referralCode"), CONSTRAINT "PK_74278d8812a049233ce41440ac7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8d741f8e462d538929cc5162c1" ON "persons" ("phone", "countryCode") WHERE "phone" IS NOT NULL AND "phone" != '' AND "countryCode" IS NOT NULL AND "countryCode" != '{}'`);

        await queryRunner.query(`
            INSERT INTO "persons" ("username" ,"email" ,"pendingEmail" ,"pendingEmailCode" ,"lastEmailChangeSentAt" ,"password" ,"type" ,"phone" ,"countryCode" ,"isPhoneVerified" ,"last_login" ,"devices" ,"googleId" ,"appleId" ,"resetPasswordToken" ,"lastResetPasswordSentAt" ,"resetPasswordExpires" ,"otpCode" ,"otpLastSentAt" ,"otpExpiresAt" ,"referralCode" ,"referred_by_id" ,"referralCount" ,"referralRewardsCount" ,"languages" ,"country_id" ,"permissions", "status", "deactivated_at")
            SELECT  "username" ,"email" ,"pendingEmail" ,"pendingEmailCode" ,"lastEmailChangeSentAt" ,"password" ,"type" ,"phone" ,"countryCode" ,"isPhoneVerified" ,"last_login" ,"devices" ,"googleId" ,"appleId" ,"resetPasswordToken" ,"lastResetPasswordSentAt" ,"resetPasswordExpires" ,"otpCode" ,"otpLastSentAt" ,"otpExpiresAt" ,"referralCode" ,"referred_by_id" ,"referralCount" ,"referralRewardsCount" ,"languages" ,"country_id" ,"permissions", "status"::text::persons_status_enum, "deactivated_at"
            FROM "users" WHERE "id" NOT IN (SELECT "sub_user_id" FROM "user_related_accounts")
            `);

        await queryRunner.query(`ALTER TABLE "users" ADD "person_id" uuid`);
        await queryRunner.query(`ALTER TABLE "persons" ADD CONSTRAINT "FK_9cc1bbae0b75bd4e0081fe74f61" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "persons" ADD CONSTRAINT "FK_b4a84ca5a0efbd6d25c46e33ae6" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_5ed72dcd00d6e5a88c6a6ba3d18" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        await queryRunner.query(`
            UPDATE "users" u 
            SET "person_id" = p.id 
            FROM "persons" p 
            WHERE TRIM(u.email) = p.email
        `);

        await queryRunner.query(`
            UPDATE "users" u_sub
            SET "person_id" = u_main.person_id
            FROM "user_related_accounts" ura
            JOIN "users" u_main ON ura.main_user_id = u_main.id
            WHERE ura.sub_user_id = u_sub.id
        `);

        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_login"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "devices"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deactivated_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "resetPasswordExpires"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referred_by_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referralCount"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referralRewardsCount"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "languages"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastResetPasswordSentAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "country_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastEmailChangeSentAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "countryCode"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "permissions"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otpLastSentAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otpExpiresAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isPhoneVerified"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "type"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_f382af58ab36057334fb262efd5"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "googleId"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_60cea0d80c39eedaaaf5e21f175"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "appleId"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "resetPasswordToken"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_b7f8278f4e89249bb75c9a15899"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referralCode"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pendingEmail"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pendingEmailCode"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otpCode"`);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_5ed72dcd00d6e5a88c6a6ba3d18"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP CONSTRAINT "FK_b4a84ca5a0efbd6d25c46e33ae6"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP CONSTRAINT "FK_9cc1bbae0b75bd4e0081fe74f61"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "person_id"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "otpCode" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "pendingEmailCode" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "pendingEmail" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "referralCode" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_b7f8278f4e89249bb75c9a15899" UNIQUE ("referralCode")`);
        await queryRunner.query(`ALTER TABLE "users" ADD "resetPasswordToken" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "appleId" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_60cea0d80c39eedaaaf5e21f175" UNIQUE ("appleId")`);
        await queryRunner.query(`ALTER TABLE "users" ADD "googleId" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_f382af58ab36057334fb262efd5" UNIQUE ("googleId")`);
        await queryRunner.query(`ALTER TABLE "users" ADD "phone" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "type" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD "password" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "email" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "users" ADD "username" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username")`);
        await queryRunner.query(`ALTER TABLE "users" ADD "isPhoneVerified" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "otpExpiresAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "otpLastSentAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "permissions" jsonb`);
        await queryRunner.query(`ALTER TABLE "users" ADD "countryCode" jsonb NOT NULL DEFAULT '{"code": "SA", "dial_code": "+966"}'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "lastEmailChangeSentAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "country_id" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "lastResetPasswordSentAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "languages" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "referralRewardsCount" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "referralCount" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "referred_by_id" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "resetPasswordExpires" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deactivated_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "devices" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "last_login" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'deleted', 'inactive', 'pending_verification', 'suspended')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "status" "public"."users_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d741f8e462d538929cc5162c1"`);
        await queryRunner.query(`DROP TABLE "persons"`);
        await queryRunner.query(`DROP TYPE "public"."persons_status_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c8fe6cfe9bef772cdf3f2e317f" ON "users" ("phone", "countryCode") WHERE ((phone IS NOT NULL) AND ((phone)::text <> ''::text) AND ("countryCode" IS NOT NULL) AND ("countryCode" <> '{}'::jsonb))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_ae78dc6cb10aa14cfef96b2dd90" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_a78a00605c95ca6737389f6360b" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
