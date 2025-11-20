import { Controller, Get } from "@nestjs/common";
import { CountriesService } from "./countries.service";
import { Country } from "entities/global.entity";


@Controller('countries')
export class CountriesController {
    constructor(private readonly countriesService: CountriesService) { }

    @Get()
    async getAllCountries(): Promise<Country[]> {
        return this.countriesService.findAll();
    }
}
