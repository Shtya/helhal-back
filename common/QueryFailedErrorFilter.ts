import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Inject } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import { TranslationService } from './translation.service';

@Catch(QueryFailedError)
export class QueryFailedErrorFilter implements ExceptionFilter {


  // @Inject(I18nService)  
  //   public readonly i18n: I18nService;
  constructor(private readonly i18n: TranslationService) { }


  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception.driverError?.code === '23503') {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: this.i18n.t("events.cannot_delete_or_update"),
        error: exception.driverError?.error || 'Foreign Key Constraint Violation',
        details: exception.driverError?.detail,
      });
    }
    else if (exception.code === '42P01') {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: this.i18n.t("events.missing_table_in_from_clause"),
        error: this.i18n.t('events.missing-from-clause-entry-error'),
        details: exception.driverError?.detail,
      });
    }

    else {
      // Handle other database errors
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: this.i18n.t("events.unexpected_database_error"),
        error: this.i18n.t('events.database-error'),
        details: exception?.message,
      });
    }
  }
}