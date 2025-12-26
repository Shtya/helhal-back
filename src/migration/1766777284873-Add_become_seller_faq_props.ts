import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddBecomeSellerFaqProps1766777284873 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns('settings', [
            new TableColumn({
                name: 'becomeSellerFaqs_en',
                type: 'jsonb',
                default: `'[]'`,
                isNullable: false,
            }),
            new TableColumn({
                name: 'becomeSellerFaqs_ar',
                type: 'jsonb',
                default: `'[]'`,
                isNullable: false,
            }),
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('settings', 'becomeSellerFaqs_ar');
        await queryRunner.dropColumn('settings', 'becomeSellerFaqs_en');
    }
}
