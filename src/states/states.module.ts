import { TypeOrmModule } from "@nestjs/typeorm";

import { Module } from "@nestjs/common";
import { Country, State } from "entities/global.entity";
import { StateController } from "./states.controller";
import { StateService } from "./states.service";


@Module({
    imports: [TypeOrmModule.forFeature([State, Country])], // register the Country entity
    controllers: [StateController],
    providers: [StateService],
})
export class StatesModule { }