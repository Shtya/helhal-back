import { MigrationInterface, QueryRunner } from "typeorm";

export class FixIndexName1769698442628 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_person_phone_country"
      ON "persons" ("phone", "countryCode")
      WHERE
        "phone" IS NOT NULL
        AND "phone"::text <> ''
        AND "countryCode" IS NOT NULL
        AND "countryCode" <> '{}'::jsonb
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_person_phone_country"
    `);
    }
}