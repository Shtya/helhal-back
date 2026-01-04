import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from "typeorm";

export class AddCountryToService1767537243924 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add country_id column
        await queryRunner.addColumn(
            "services",
            new TableColumn({
                name: "country_id",
                type: "uuid", // or "int" depending on your Country PK type
                isNullable: true,
            })
        );

        // Add state_id column
        await queryRunner.addColumn(
            "services",
            new TableColumn({
                name: "state_id",
                type: "uuid", // or "int" depending on your State PK type
                isNullable: true,
            })
        );

        // Add foreign key to Country
        await queryRunner.createForeignKey(
            "services",
            new TableForeignKey({
                columnNames: ["country_id"],
                referencedTableName: "countries",
                referencedColumnNames: ["id"],
                onDelete: "SET NULL",
            })
        );

        // Add foreign key to State
        await queryRunner.createForeignKey(
            "services",
            new TableForeignKey({
                columnNames: ["state_id"],
                referencedTableName: "states",
                referencedColumnNames: ["id"],
                onDelete: "SET NULL",
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign keys first
        const table = await queryRunner.getTable("services");
        if (table) {
            const countryFk = table.foreignKeys.find(fk => fk.columnNames.includes("country_id"));
            if (countryFk) await queryRunner.dropForeignKey("services", countryFk);

            const stateFk = table.foreignKeys.find(fk => fk.columnNames.includes("state_id"));
            if (stateFk) await queryRunner.dropForeignKey("services", stateFk);
        }

        // Drop columns
        await queryRunner.dropColumn("services", "country_id");
        await queryRunner.dropColumn("services", "state_id");
    }
}
