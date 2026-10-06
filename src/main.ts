import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  BadRequestException,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // NestExpressApplication gives access to Express settings like app.set()
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // TRUST_PROXY in .env: "true" (local testing), "1" (one proxy in front), or unset (no proxy)
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    app.set(
      'trust proxy',
      trustProxy === 'true' ? true : Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy),
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
      exceptionFactory: (errors) => {
        const formatted: Record<string, string> = {};

        errors.forEach((error) => {
          formatted[error.property] = Object.values(error.constraints ?? {})[0];
        });

        return new BadRequestException({
          message: 'Validation failed',
          errors: formatted,
          code: HttpStatus.BAD_REQUEST,
        });
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder().setTitle('Rate Limiter')
  .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
  .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.get<number>('PORT') ?? 3000);
}
bootstrap();