import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsPhoneVerified1768224376471 implements MigrationInterface {
    name = 'AddIsPhoneVerified1768224376471'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "isPhoneVerified" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isPhoneVerified"`);
    }

}
