import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { EventsGateway } from './events.gateway';

@Injectable()
export class KanbanWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KanbanWatcherService.name);
  private childProcess: ChildProcess | null = null;
  private shouldRestart = true;

  constructor(private eventsGateway: EventsGateway) {}

  onModuleInit() {
    this.startWatching();
  }

  onModuleDestroy() {
    this.shouldRestart = false;
    this.stopWatching();
  }

  startWatching() {
    if (!this.shouldRestart) return;

    try {
      this.childProcess = spawn('hermes', ['kanban', 'watch'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.childProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          this.parseAndBroadcast(line);
        }
      });

      this.childProcess.stderr?.on('data', (data: Buffer) => {
        this.logger.warn(`[kanban-watch] stderr: ${data.toString()}`);
      });

      this.childProcess.on('close', (code) => {
        this.logger.log(
          `[kanban-watch] exited with code ${code}, restarting in 5s...`,
        );
        if (this.shouldRestart) {
          setTimeout(() => this.startWatching(), 5000);
        }
      });

      this.logger.log('[kanban-watch] Started watching kanban events');
    } catch (err) {
      this.logger.warn(
        `[kanban-watch] Failed to start, retrying in 10s... ${err}`,
      );
      if (this.shouldRestart) {
        setTimeout(() => this.startWatching(), 10000);
      }
    }
  }

  stopWatching() {
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
  }

  getWatcherStatus(): { running: boolean } {
    return {
      running:
        this.childProcess !== null && this.childProcess.exitCode === null,
    };
  }

  private parseAndBroadcast(line: string) {
    try {
      // Hermes kanban watch outputs JSON lines
      const event = JSON.parse(line);
      this.eventsGateway.broadcastKanbanEvent(event.type || 'unknown', event);

      // If task status change, also broadcast task-specific update
      if (event.task_id && event.status) {
        this.eventsGateway.broadcastTaskUpdate(
          event.task_id,
          event.status,
          event.assignee,
        );
      }
    } catch {
      // Non-JSON line, broadcast as raw message
      this.eventsGateway.broadcastKanbanEvent('raw', { message: line });
    }
  }
}
