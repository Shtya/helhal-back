import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class UpdateFaqsColumns1688888888888 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove old columns
        await queryRunner.dropColumn('settings', 'faqs');
        await queryRunner.dropColumn('settings', 'faqs_ar');

        // Add new seller and invite FAQ columns
        await queryRunner.addColumns('settings', [
            new TableColumn({
                name: 'seller_faqs_en',
                type: 'jsonb',
                isNullable: false,
                default: `'[]'`,
            }),
            new TableColumn({
                name: 'seller_faqs_ar',
                type: 'jsonb',
                isNullable: false,
                default: `'[]'`,
            }),
            new TableColumn({
                name: 'invite_faqs_en',
                type: 'jsonb',
                isNullable: false,
                default: `'[]'`,
            }),
            new TableColumn({
                name: 'invite_faqs_ar',
                type: 'jsonb',
                isNullable: false,
                default: `'[]'`,
            }),
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert: remove new columns
        await queryRunner.dropColumn('settings', 'seller_faqs_en');
        await queryRunner.dropColumn('settings', 'seller_faqs_ar');
        await queryRunner.dropColumn('settings', 'invite_faqs_en');
        await queryRunner.dropColumn('settings', 'invite_faqs_ar');

        // Re-add old columns
        await queryRunner.addColumns('settings', [
            new TableColumn({
                name: 'faqs',
                type: 'jsonb',
                isNullable: false,
                default: `'[]'`,
            }),
            new TableColumn({
                name: 'faqs_ar',
                type: 'jsonb',
                isNullable: false,
                default: `'[]'`,
            }),
        ]);
    }
}
