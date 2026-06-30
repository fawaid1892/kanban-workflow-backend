import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RolesModule } from './roles/roles.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { EventsModule } from './events/events.module';
import { AppController } from './app.controller';

@Module({
  imports: [ConfigModule, DatabaseModule, RolesModule, SandboxModule, EventsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
