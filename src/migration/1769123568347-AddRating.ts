import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRating1769123568347 implements MigrationInterface {
    name = 'AddRating1769123568347'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "order_ratings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "order_id" uuid NOT NULL, "buyer_id" uuid NOT NULL, "seller_id" uuid NOT NULL, "service_id" uuid, "buyer_rating_quality" integer, "buyer_rating_communication" integer, "buyer_rating_skills" integer, "buyer_rating_availability" integer, "buyer_rating_cooperation" integer, "buyer_review_text" text, "buyer_total_score" double precision, "buyer_rated_at" TIMESTAMP, "seller_rating_communication" integer, "seller_rating_cooperation" integer, "seller_rating_availability" integer, "seller_rating_clarity" integer, "seller_rating_payment" integer, "seller_review_text" text, "seller_total_score" double precision, "seller_rated_at" TIMESTAMP, "isPublic" boolean NOT NULL DEFAULT false, CONSTRAINT "REL_ac2ea4d30e34d7bb72afd11cea" UNIQUE ("order_id"), CONSTRAINT "PK_6d707a3d524f0038d682da8d9ee" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ac2ea4d30e34d7bb72afd11cea" ON "order_ratings" ("order_id") `);
        await queryRunner.query(`ALTER TABLE "users" ADD "rating" double precision DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "order_ratings" ADD CONSTRAINT "FK_ac2ea4d30e34d7bb72afd11cea2" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_ratings" ADD CONSTRAINT "FK_202774baad5463c6ef7774fe12f" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_ratings" ADD CONSTRAINT "FK_115a023742c779acbd8458be803" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_ratings" ADD CONSTRAINT "FK_c975ea3f86f0cec93ff51afed6b" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_ratings" DROP CONSTRAINT "FK_c975ea3f86f0cec93ff51afed6b"`);
        await queryRunner.query(`ALTER TABLE "order_ratings" DROP CONSTRAINT "FK_115a023742c779acbd8458be803"`);
        await queryRunner.query(`ALTER TABLE "order_ratings" DROP CONSTRAINT "FK_202774baad5463c6ef7774fe12f"`);
        await queryRunner.query(`ALTER TABLE "order_ratings" DROP CONSTRAINT "FK_ac2ea4d30e34d7bb72afd11cea2"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "rating"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ac2ea4d30e34d7bb72afd11cea"`);
        await queryRunner.query(`DROP TABLE "order_ratings"`);
    }

}
