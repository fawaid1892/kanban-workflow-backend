import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { BoardModule } from './board/board.module';
import { AppController } from './app.controller';
import { CacheService } from './common/cache.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    WorkflowsModule,
    BoardModule,
  ],
  controllers: [AppController],
  providers: [CacheService],
  exports: [CacheService],
})
export class AppModule {}
