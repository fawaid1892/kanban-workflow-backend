import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { RateLimitMiddleware } from './common/rate-limit.middleware';
import { GlobalExceptionFilter } from './common/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Rate limiting: 100 req/min per IP
  app.use(new RateLimitMiddleware().use.bind(new RateLimitMiddleware()));

  const port = process.env.PORT || 8080;
  await app.listen(port);
  console.log(`Backend running on port ${port}`);
}
void bootstrap();
