import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class MakeServiceCountryNotNullable1767539000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.changeColumn(
            "services",
            "country_id",
            new TableColumn({
                name: "country_id",
                type: "uuid",
                isNullable: false, // ✅ now NOT NULL
            })
        );
        await queryRunner.changeColumn(
            "jobs",
            "country_id",
            new TableColumn({
                name: "country_id",
                type: "uuid",
                isNullable: false, // ✅ now NOT NULL
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.changeColumn(
            "services",
            "country_id",
            new TableColumn({
                name: "country_id",
                type: "uuid",
                isNullable: true, // rollback
            })
        );
        await queryRunner.changeColumn(
            "jobs",
            "country_id",
            new TableColumn({
                name: "country_id",
                type: "uuid",
                isNullable: true, // rollback
            })
        );
    }
}
