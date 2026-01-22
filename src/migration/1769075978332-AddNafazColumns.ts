import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNafazColumns1769075978332 implements MigrationInterface {
    name = 'AddNafazColumns1769075978332'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "persons" ADD "nationalId" character varying`);
        await queryRunner.query(`ALTER TABLE "persons" ADD CONSTRAINT "UQ_2bcdceb78713e1b1cfc7aa2ba4d" UNIQUE ("nationalId")`);
        await queryRunner.query(`ALTER TABLE "persons" ADD "nafathTransId" character varying`);
        await queryRunner.query(`ALTER TABLE "persons" ADD CONSTRAINT "UQ_896e302a9c3564f9f547578480b" UNIQUE ("nafathTransId")`);
        await queryRunner.query(`ALTER TABLE "persons" ADD "nafathRandom" character varying`);
        await queryRunner.query(`ALTER TABLE "persons" ADD "nafathRequestId" character varying`);
        await queryRunner.query(`ALTER TABLE "persons" ADD CONSTRAINT "UQ_5d0d97610a4af6dfc406d900e25" UNIQUE ("nafathRequestId")`);
        await queryRunner.query(`ALTER TABLE "persons" ADD "isIdentityVerified" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "persons" DROP COLUMN "isIdentityVerified"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP CONSTRAINT "UQ_5d0d97610a4af6dfc406d900e25"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP COLUMN "nafathRequestId"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP COLUMN "nafathRandom"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP CONSTRAINT "UQ_896e302a9c3564f9f547578480b"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP COLUMN "nafathTransId"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP CONSTRAINT "UQ_2bcdceb78713e1b1cfc7aa2ba4d"`);
        await queryRunner.query(`ALTER TABLE "persons" DROP COLUMN "nationalId"`);
    }

}
