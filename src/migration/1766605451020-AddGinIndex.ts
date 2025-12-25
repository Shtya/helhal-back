import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGinIndex1766605451020 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {

        await queryRunner.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS search_vector`);
        await queryRunner.query(`ALTER TABLE services DROP COLUMN IF EXISTS search_vector`);

        // 2. Add the column with the logic (Postgres handles this, TypeORM won't know)
        await queryRunner.query(`
            ALTER TABLE jobs 
            ADD COLUMN search_vector tsvector
            GENERATED ALWAYS AS (
                setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || 
                setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
                setweight(to_tsvector('arabic', normalize_arabic(coalesce(description, ''))), 'B') || 
                setweight(to_tsvector('english', coalesce(description, '')), 'B')
            ) STORED
        `);

        await queryRunner.query(`
            ALTER TABLE services 
            ADD COLUMN search_vector tsvector
            GENERATED ALWAYS AS (
                setweight(to_tsvector('arabic', normalize_arabic(coalesce(title, ''))), 'A') || 
                setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
                setweight(to_tsvector('arabic', normalize_arabic(coalesce(brief, ''))), 'B') || 
                setweight(to_tsvector('english', coalesce(brief, '')), 'B')
            ) STORED
        `);

        // 1. Remove existing B-Tree indexes if they exist (prevents duplicates/conflicts)
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_services_search_vector"`); // services
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_jobs_search_vector"`); // jobs (if exists as btree)

        // 2. Create GIN Indexes for Services
        await queryRunner.query(`
            CREATE INDEX idx_services_search_vector 
            ON services USING GIN (search_vector)
        `);

        // 3. Create GIN Indexes for Jobs
        await queryRunner.query(`
            CREATE INDEX idx_jobs_search_vector 
            ON jobs USING GIN (search_vector)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the GIN indexes
        await queryRunner.query(`DROP INDEX IF EXISTS idx_services_search_vector`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_jobs_search_vector`);
        // 2. Drop the columns from the specific tables
        await queryRunner.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS search_vector`);
        await queryRunner.query(`ALTER TABLE services DROP COLUMN IF EXISTS search_vector`);

    }
}