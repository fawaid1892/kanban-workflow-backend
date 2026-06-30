import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { EventsGateway } from './events.gateway';
import { existsSync } from 'fs';

@Injectable()
export class KanbanWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KanbanWatcherService.name);
  private childProcess: ChildProcess | null = null;
  private shouldRestart = true;
  private hermesAvailable = false;

  constructor(private eventsGateway: EventsGateway) {}

  onModuleInit() {
    // Check if hermes binary exists before trying to spawn
    const hermesPaths = ['/usr/local/bin/hermes', '/usr/bin/hermes'];
    this.hermesAvailable = hermesPaths.some((p) => existsSync(p));

    if (!this.hermesAvailable) {
      // Also check PATH
      try {
        const { execSync } = require('child_process');
        execSync('which hermes', { stdio: 'pipe' });
        this.hermesAvailable = true;
      } catch {
        // not found
      }
    }

    if (!this.hermesAvailable) {
      this.logger.warn(
        '[kanban-watch] hermes binary not found — watcher disabled. Board API will return empty results.',
      );
      return;
    }

    this.startWatching();
  }

  onModuleDestroy() {
    this.shouldRestart = false;
    this.stopWatching();
  }

  startWatching() {
    if (!this.shouldRestart || !this.hermesAvailable) return;

    try {
      this.childProcess = spawn('hermes', ['kanban', 'watch'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Handle spawn errors (e.g., ENOENT if hermes disappears)
      this.childProcess.on('error', (err) => {
        this.logger.error(`[kanban-watch] spawn error: ${err.message}`);
        this.childProcess = null;
        if (this.shouldRestart) {
          setTimeout(() => this.startWatching(), 10_000);
        }
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
        this.childProcess = null;
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
        setTimeout(() => this.startWatching(), 10_000);
      }
    }
  }

  stopWatching() {
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
  }

  getWatcherStatus(): { running: boolean; hermesAvailable: boolean } {
    return {
      running:
        this.childProcess !== null && this.childProcess.exitCode === null,
      hermesAvailable: this.hermesAvailable,
    };
  }

  private parseAndBroadcast(line: string) {
    try {
      const event = JSON.parse(line);
      this.eventsGateway.broadcastKanbanEvent(event.type || 'unknown', event);

      if (event.task_id && event.status) {
        this.eventsGateway.broadcastTaskUpdate(
          event.task_id,
          event.status,
          event.assignee,
        );
      }
    } catch {
      this.eventsGateway.broadcastKanbanEvent('raw', { message: line });
    }
  }
}
