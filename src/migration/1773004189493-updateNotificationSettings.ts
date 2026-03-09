import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateNotificationSettings1773004189493 implements MigrationInterface {
    name = 'UpdateNotificationSettings1773004189493'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification_settings" ALTER COLUMN "settings" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "notification_settings" ALTER COLUMN "settings" SET DEFAULT '{"messages":true,"services":true,"proposals":true,"transactions":true,"disputes":true,"orders":true,"jobs":true,"others":true}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification_settings" ALTER COLUMN "settings" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "notification_settings" ALTER COLUMN "settings" SET NOT NULL`);
    }

}
