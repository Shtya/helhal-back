import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPreferedLang1773430157035 implements MigrationInterface {
    name = 'AddPreferedLang1773430157035'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."persons_preferredlanguage_enum" AS ENUM('ar', 'en')`);
        await queryRunner.query(`ALTER TABLE "persons" ADD "preferredLanguage" "public"."persons_preferredlanguage_enum" NOT NULL DEFAULT 'ar'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "persons" DROP COLUMN "preferredLanguage"`);
        await queryRunner.query(`DROP TYPE "public"."persons_preferredlanguage_enum"`);
    }

}
