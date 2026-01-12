import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateIndex1768223561685 implements MigrationInterface {
    name = 'CreateIndex1768223561685'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "idx_services_search_vector" ON "services" USING gin ("search_vector") `);
        await queryRunner.query(`CREATE INDEX "idx_jobs_search_vector" ON "jobs" USING gin ("search_vector") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_jobs_search_vector"`);
        await queryRunner.query(`DROP INDEX "public"."idx_services_search_vector"`);
    }

}
