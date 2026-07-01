import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { AppModule } from './app.module';
import { RateLimitMiddleware } from './common/rate-limit.middleware';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { randomUUID } from 'crypto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.use(compression());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Request ID tracking
  app.use((req: any, res: any, next: () => void) => {
    req.id = randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  // Rate limiting: 100 req/min per IP
  app.use(new RateLimitMiddleware().use.bind(new RateLimitMiddleware()));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Kanban Workflow Builder')
    .setDescription('API for workflow management, board tasks, and execution')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 8080;
  await app.listen(port);
  logger.log(`Backend running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
void bootstrap();
