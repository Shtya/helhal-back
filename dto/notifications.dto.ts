import { IsBoolean, IsOptional } from "class-validator";

export class NotificationCategoriesDto {
    @IsBoolean() @IsOptional() messages?: boolean;
    @IsBoolean() @IsOptional() services?: boolean;
    @IsBoolean() @IsOptional() proposals?: boolean;
    @IsBoolean() @IsOptional() transactions?: boolean;
    @IsBoolean() @IsOptional() disputes?: boolean;
    @IsBoolean() @IsOptional() orders?: boolean;
    @IsBoolean() @IsOptional() jobs?: boolean;
    @IsBoolean() @IsOptional() others?: boolean;
}