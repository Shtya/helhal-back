import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddFAQAR1766686297212 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn('settings', new TableColumn({
            name: 'faqs_ar',
            type: 'jsonb',
            isNullable: false,
            default: `'[]'`, // default empty array
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('settings', 'faqs_ar');
    }

}
