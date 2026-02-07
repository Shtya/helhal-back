import { MigrationInterface, QueryRunner } from "typeorm";

export class EditSettings1770476295217 implements MigrationInterface {
    name = 'EditSettings1770476295217'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "privacy_policy_en"`);
        await queryRunner.query(`ALTER TABLE "settings" ADD "privacy_policy_en" jsonb`);
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "terms_of_service_en"`);
        await queryRunner.query(`ALTER TABLE "settings" ADD "terms_of_service_en" jsonb`);
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "privacy_policy_ar"`);
        await queryRunner.query(`ALTER TABLE "settings" ADD "privacy_policy_ar" jsonb`);
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "terms_of_service_ar"`);
        await queryRunner.query(`ALTER TABLE "settings" ADD "terms_of_service_ar" jsonb`);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "terms_of_service_ar"`);
        await queryRunner.query(`ALTER TABLE "settings" ADD "terms_of_service_ar" text NOT NULL`);
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "privacy_policy_ar"`);
        await queryRunner.query(`ALTER TABLE "settings" ADD "privacy_policy_ar" text NOT NULL`);
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "terms_of_service_en"`);
        await queryRunner.query(`ALTER TABLE "settings" ADD "terms_of_service_en" text NOT NULL`);
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "privacy_policy_en"`);
        await queryRunner.query(`ALTER TABLE "settings" ADD "privacy_policy_en" text NOT NULL`);
    }

}
