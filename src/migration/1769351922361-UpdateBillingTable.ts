import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateBillingTable1769351922361 implements MigrationInterface {
    name = 'UpdateBillingTable1769351922361'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "transaction_billing_info" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "transaction_id" character varying NOT NULL, "user_id" character varying NOT NULL, "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "phone_number" character varying NOT NULL, "email" character varying NOT NULL, "state_name" character varying, "country_iso" character varying, "is_saudi_resident" boolean NOT NULL, CONSTRAINT "PK_991e93047bbe956abeac2522a70" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" DROP COLUMN "state"`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" ADD "first_name" character varying`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" ADD "last_name" character varying`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" ADD "state_id" uuid`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" ADD "state" character varying`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" ADD CONSTRAINT "FK_573762d8eb2fce475f11434b81e" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_billing_info" DROP CONSTRAINT "FK_573762d8eb2fce475f11434b81e"`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" DROP COLUMN "state"`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" DROP COLUMN "state_id"`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" DROP COLUMN "last_name"`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" DROP COLUMN "first_name"`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" ADD "state" character varying NOT NULL`);

        await queryRunner.query(`DROP TABLE "transaction_billing_info"`);
    }

}
