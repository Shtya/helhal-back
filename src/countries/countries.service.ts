import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Country } from "entities/global.entity";
import { Repository } from "typeorm";

@Injectable()
export class CountriesService {
    constructor(
        @InjectRepository(Country)
        private readonly countriesRepository: Repository<Country>,
    ) { }

    async findAll(): Promise<Country[]> {
        return this.countriesRepository.find();
    }


}