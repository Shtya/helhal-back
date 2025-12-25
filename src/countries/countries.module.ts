import { TypeOrmModule } from "@nestjs/typeorm";
import { CountriesController } from "./countries.controller";
import { CountriesService } from "./countries.service";
import { Module } from "@nestjs/common";
import { Country } from "entities/global.entity";


@Module({
    imports: [TypeOrmModule.forFeature([Country])], // register the Country entity
    controllers: [CountriesController],
    providers: [CountriesService],
})
export class CountriesModule { }