import { Controller, Get, Post, Put, Param, Query, Body, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { BoardService } from './board.service';

@Controller('workflows/:workflowId/board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get('tasks')
  getTasks(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Query('status') status?: string,
    @Query('assignee') assignee?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.boardService.getTasks(workflowId, {
      status,
      assignee,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('tasks/:taskId')
  getTaskDetail(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('taskId') taskId: string,
  ) {
    return this.boardService.getTaskDetail(workflowId, taskId);
  }

  @Put('tasks/:taskId/status')
  @HttpCode(HttpStatus.OK)
  updateTaskStatus(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('taskId') taskId: string,
    @Body('status') status: string,
  ) {
    return this.boardService.updateTaskStatus(workflowId, taskId, status);
  }

  @Post('tasks/:taskId/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('taskId') taskId: string,
    @Body('body') body: string,
    @Body('author') author?: string,
  ) {
    return this.boardService.addComment(workflowId, taskId, body, author ?? 'user');
  }

  @Put('tasks/bulk-status')
  @HttpCode(HttpStatus.OK)
  bulkUpdateStatus(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Body('taskIds') taskIds: string[],
    @Body('status') status: string,
  ) {
    return this.boardService.bulkUpdateStatus(workflowId, taskIds, status);
  }

  @Put('tasks/:taskId/priority')
  @HttpCode(HttpStatus.OK)
  updatePriority(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('taskId') taskId: string,
    @Body('priority') priority: number,
  ) {
    return this.boardService.updateTaskPriority(workflowId, taskId, priority);
  }

  @Get('stats')
  getStats(@Param('workflowId', ParseIntPipe) workflowId: number) {
    return this.boardService.getStats(workflowId);
  }
}
