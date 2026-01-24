import { IsInt, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';

// For Buyer rating Seller
export class RateSellerDto {
    @IsInt() @Min(1) @Max(5)
    quality: number;

    @IsInt() @Min(1) @Max(5)
    communication: number;

    @IsInt() @Min(1) @Max(5)
    skills: number;

    @IsInt() @Min(1) @Max(5)
    availability: number;

    @IsInt() @Min(1) @Max(5)
    cooperation: number;

    @IsOptional() @IsString() @MaxLength(5000)
    reviewText?: string;
}

// For Seller rating Buyer
export class RateBuyerDto {
    @IsInt() @Min(1) @Max(5)
    communication: number;

    @IsInt() @Min(1) @Max(5)
    cooperation: number;

    @IsInt() @Min(1) @Max(5)
    availability: number;

    @IsInt() @Min(1) @Max(5)
    clarity: number;

    @IsInt() @Min(1) @Max(5)
    payment: number;

    @IsOptional() @IsString() @MaxLength(5000)
    reviewText?: string;
}