import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { LoggingValidationPipe } from 'common/translationPipe';
import { ConfigService } from '@nestjs/config';
import { QueryFailedErrorFilter } from 'common/QueryFailedErrorFilter';
import { json } from 'express';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);
	const port = process.env.PORT || 3030;

	app.useGlobalFilters(app.get(QueryFailedErrorFilter));
	app.use(json({ limit: '10mb' }));
	app.useStaticAssets(join(__dirname, '..', '..', '/uploads'), { prefix: '/uploads/' });

	app.enableCors({
		// origin: configService.get('ALLOWED_ORIGINS')?.split(',') || '*',
		origin: [
			'https://www.helhal.com',
			'https://helhal.com',
			'http://localhost:3000', // للتجارب
			'https://binaural-taryn-unprecipitatively.ngrok-free.dev', // للتجارب

		],
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		credentials: true,
		allowedHeaders: 'Content-Type,Authorization,x-lang',
		exposedHeaders: 'Content-Length,Content-Range',
	});

	app.setGlobalPrefix('api/v1');

	const loggingValidationPipe = app.get(LoggingValidationPipe);
	app.useGlobalPipes(loggingValidationPipe);

	app.useGlobalPipes(new ValidationPipe({ disableErrorMessages: false, transform: true, forbidNonWhitelisted: true, whitelist: true }));
	// main.ts
	app.useGlobalInterceptors(
		new ClassSerializerInterceptor(app.get(Reflector)),
	);

	Logger.log(`🚀 server is running on port ${port}`);
	await app.listen(port || 8081, '0.0.0.0');
}
bootstrap();
