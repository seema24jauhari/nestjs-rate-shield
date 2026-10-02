import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  //app.useGlobalFilters(new GlobalExceptionFilter());
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

  const config = new DocumentBuilder().setTitle('Rate Limiter').build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();