import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { KanbanWatcherService } from './kanban-watcher.service';
import { EventsController } from './events.controller';

@Module({
  providers: [EventsGateway, KanbanWatcherService],
  controllers: [EventsController],
  exports: [EventsGateway],
})
export class EventsModule {}
