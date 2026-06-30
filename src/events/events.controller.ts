import { Controller, Get } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { KanbanWatcherService } from './kanban-watcher.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsGateway: EventsGateway,
    private readonly kanbanWatcherService: KanbanWatcherService,
  ) {}

  @Get('status')
  getStatus() {
    return {
      connectedClients: this.eventsGateway.getConnectedClientsCount(),
      watcher: this.kanbanWatcherService.getWatcherStatus(),
    };
  }
}
