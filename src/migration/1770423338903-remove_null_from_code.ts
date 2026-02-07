import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveNullFromCode1770423338903 implements MigrationInterface {
    name = 'RemoveNullFromCode1770423338903'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ALTER COLUMN "bank_code" SET NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_bank_accounts" ALTER COLUMN "bank_code" DROP NOT NULL`);
    }

}
