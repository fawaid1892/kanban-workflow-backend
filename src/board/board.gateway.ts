import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class BoardGateway {
  private readonly logger = new Logger(BoardGateway.name);

  @WebSocketServer()
  server!: Server;

  broadcastBoardUpdate(workflowId: number) {
    this.logger.log(`Broadcasting board update for workflow ${workflowId}`);
    this.server?.to(`workflow-${workflowId}`).emit('board:update', { workflowId });
  }

  broadcastRunComplete(workflowId: number, runId: number) {
    this.logger.log(`Broadcasting run complete for workflow ${workflowId}, run ${runId}`);
    this.server?.to(`workflow-${workflowId}`).emit('run:complete', { workflowId, runId });
  }

  handleConnection(client: any) {
    const workflowId = client.handshake?.query?.workflowId;
    if (workflowId) {
      client.join(`workflow-${workflowId}`);
      this.logger.log(`Client joined workflow-${workflowId}`);
    }
  }
}
