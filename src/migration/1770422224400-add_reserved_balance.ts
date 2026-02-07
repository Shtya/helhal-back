import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReservedBalance1770422224400 implements MigrationInterface {
    name = 'AddReservedBalance1770422224400'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_balances" ADD "reserved_balance" numeric NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_person_phone_country"`);
    }

}
