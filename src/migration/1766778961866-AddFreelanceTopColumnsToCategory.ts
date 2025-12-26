import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddFreelanceTopColumnsToCategory1766778961866 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn("categories", new TableColumn({
            name: "freelanceTop",
            type: "boolean",
            default: false
        }));

        await queryRunner.addColumn("categories", new TableColumn({
            name: "freelanceTopIconUrl",
            type: "varchar",
            isNullable: true
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("categories", "freelanceTop");
        await queryRunner.dropColumn("categories", "freelanceTopIconUrl");
    }
}