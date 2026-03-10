import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Setting, User } from "entities/global.entity";
import { MailService } from "./nodemailer";
import { SettingsService } from "src/settings/settings.service";


@Module({
    imports: [
        TypeOrmModule.forFeature([User, Setting])
    ],
    providers: [MailService, SettingsService],
    exports: [MailService]
})
export class MailModule { }
