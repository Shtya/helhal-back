import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateCategories1768743155652 implements MigrationInterface {
    name = 'UpdateCategories1768743155652'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "parentId"`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "parentId" uuid`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "parentId"`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "parentId" character varying`);
    }

}
