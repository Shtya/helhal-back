import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPayOnDelivery1770568036083 implements MigrationInterface {
    name = 'AddPayOnDelivery1770568036083'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "order_offline_contracts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "orderId" uuid NOT NULL, "buyerId" uuid NOT NULL, "sellerId" uuid NOT NULL, "serviceId" uuid, "amountToPayAtDoor" numeric(12,2) NOT NULL, "platformFeePaidOnline" numeric(12,2) NOT NULL DEFAULT '0', CONSTRAINT "REL_20b11953045bf4e6e7b1f4a329" UNIQUE ("orderId"), CONSTRAINT "PK_88e3a49c697db1d10ccfe60ff06" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "services" ADD "payOnDelivery" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "payOnDelivery" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "order_offline_contracts" ADD CONSTRAINT "FK_20b11953045bf4e6e7b1f4a329e" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_offline_contracts" ADD CONSTRAINT "FK_1399b840a7b4f9c3ff16d572543" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_offline_contracts" ADD CONSTRAINT "FK_55c95178de7460420686a9f14fd" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_offline_contracts" ADD CONSTRAINT "FK_165e0e4e7d24cf8453d63267143" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_offline_contracts" DROP CONSTRAINT "FK_165e0e4e7d24cf8453d63267143"`);
        await queryRunner.query(`ALTER TABLE "order_offline_contracts" DROP CONSTRAINT "FK_55c95178de7460420686a9f14fd"`);
        await queryRunner.query(`ALTER TABLE "order_offline_contracts" DROP CONSTRAINT "FK_1399b840a7b4f9c3ff16d572543"`);
        await queryRunner.query(`ALTER TABLE "order_offline_contracts" DROP CONSTRAINT "FK_20b11953045bf4e6e7b1f4a329e"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "payOnDelivery"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "payOnDelivery"`);
        await queryRunner.query(`DROP TABLE "order_offline_contracts"`);
    }

}
