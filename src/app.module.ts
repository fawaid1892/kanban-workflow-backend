import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
