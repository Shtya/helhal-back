import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserCardsTable1769386386322 implements MigrationInterface {
    name = 'AddUserCardsTable1769386386322'

    public async up(queryRunner: QueryRunner): Promise<void> {

        await queryRunner.query(`CREATE TABLE "user_saved_cards" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid NOT NULL, "token" character varying NOT NULL, "masked_pan" character varying NOT NULL, "card_subtype" character varying, "paymob_token_id" bigint NOT NULL, "last_transaction_id" character varying, CONSTRAINT "UQ_10dbfb99f1df9f64e3b33a7a166" UNIQUE ("user_id", "token"), CONSTRAINT "PK_647986b407001db73486d108b0e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_541df1bad21f59337ab9ed8dd2" ON "user_saved_cards" ("token") `);
        await queryRunner.query(`ALTER TABLE "user_billing_info" DROP COLUMN "state"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "external_transaction_id" character varying`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "external_order_id" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_saved_cards" DROP CONSTRAINT "FK_963765cd9eff953e0a667cb1f95"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "external_order_id"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "external_transaction_id"`);
        await queryRunner.query(`ALTER TABLE "user_billing_info" ADD "state" character varying`);
        await queryRunner.query(`DROP INDEX "public"."IDX_541df1bad21f59337ab9ed8dd2"`);
        await queryRunner.query(`DROP TABLE "user_saved_cards"`);
    }

}
