import { IsArray, IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SendInviteDto {
    @IsArray()
    @IsEmail({}, { each: true })
    emails: string[];

    @IsString()
    @IsNotEmpty()
    subject: string;

    @IsString()
    @IsNotEmpty()
    senderName: string;

    @IsString()
    @IsNotEmpty()
    message: string;
}
