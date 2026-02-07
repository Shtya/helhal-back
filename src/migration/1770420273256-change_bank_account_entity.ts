import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeBankAccountEntity1770420273256 implements MigrationInterface {
    name = 'ChangeBankAccountEntity1770420273256'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" DROP COLUMN "client_id"`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" DROP COLUMN "client_secret"`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" DROP COLUMN "country"`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" DROP COLUMN "state"`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" DROP COLUMN "mobile_number"`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" DROP COLUMN "bank_name"`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" DROP COLUMN "account_number"`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ADD "bank_code" character varying`);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" DROP COLUMN "bank_code"`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ADD "account_number" character varying`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ADD "bank_name" character varying`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ADD "mobile_number" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ADD "state" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ADD "country" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ADD "client_secret" character varying`);
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ADD "client_id" character varying`);
    }

}
