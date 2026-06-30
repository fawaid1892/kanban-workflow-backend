import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/events' })
export class EventsGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer() server: Server;

  // Track connected clients
  private clients = new Map<string, Socket>();

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.clients.set(client.id, client);
    client.emit('connected', { clientId: client.id });
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.clients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Broadcast kanban event ke semua client
  broadcastKanbanEvent(event: string, data: unknown) {
    this.server.emit('kanban:event', {
      event,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // Broadcast task status change
  broadcastTaskUpdate(taskId: string, status: string, assignee?: string) {
    this.server.emit('kanban:taskUpdate', {
      taskId,
      status,
      assignee,
      timestamp: new Date().toISOString(),
    });
  }

  // Broadcast sandbox build progress
  broadcastBuildProgress(
    roleSlug: string,
    buildId: string,
    output: string,
    status: string,
  ) {
    this.server.emit('sandbox:buildProgress', {
      roleSlug,
      buildId,
      output,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle client subscription requests
  @SubscribeMessage('subscribe:board')
  handleBoardSubscribe(client: Socket) {
    client.join('board');
    return { success: true, room: 'board' };
  }

  @SubscribeMessage('subscribe:role')
  handleRoleSubscribe(client: Socket, roleSlug: string) {
    client.join(`role:${roleSlug}`);
    return { success: true, room: `role:${roleSlug}` };
  }

  @SubscribeMessage('unsubscribe:all')
  handleUnsubscribeAll(client: Socket) {
    client.rooms.forEach((room) => {
      if (room !== client.id) client.leave(room);
    });
    return { success: true };
  }

  // Expose connected client count for health checks
  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}
