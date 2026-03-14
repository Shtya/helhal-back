import { IsBoolean, IsEnum, IsOptional } from "class-validator";
import { Language } from "entities/global.entity";

export class NotificationCategoriesDto {
    @IsBoolean() @IsOptional() messages?: boolean;
    @IsBoolean() @IsOptional() services?: boolean;
    @IsBoolean() @IsOptional() proposals?: boolean;
    @IsBoolean() @IsOptional() transactions?: boolean;
    @IsBoolean() @IsOptional() disputes?: boolean;
    @IsBoolean() @IsOptional() orders?: boolean;
    @IsBoolean() @IsOptional() jobs?: boolean;
    @IsBoolean() @IsOptional() others?: boolean;
    @IsEnum(Language) @IsOptional() language?: Language;
}