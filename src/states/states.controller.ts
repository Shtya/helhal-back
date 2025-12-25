import { Controller, Get, Param } from "@nestjs/common";
import { StateService } from "./states.service";

@Controller('states')
export class StateController {
    constructor(private readonly stateService: StateService) { }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.stateService.findOne(id);
    }

    @Get('by-country/:countryId')
    findAllByCountry(@Param('countryId') countryId: string) {
        return this.stateService.findAllByCountryId(countryId);
    }
}
