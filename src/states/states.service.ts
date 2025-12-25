import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Country, State } from 'entities/global.entity';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';


@Injectable()
export class StateService {
    constructor(
        @InjectRepository(State)
        private readonly stateRepository: Repository<State>,
        @InjectRepository(Country)
        private readonly countryRepository: Repository<Country>,
    ) { }

    async findOne(id: string): Promise<State> {
        return this.stateRepository.findOne({ where: { id }, relations: ['country'] });
    }

    async findAllByCountryId(countryId: string): Promise<State[]> {
        return this.stateRepository.find({
            where: { country: { id: countryId } },
            relations: ['country'],
        });
    }
}
