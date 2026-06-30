import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
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

  @Get('stats')
  getStats(@Param('workflowId', ParseIntPipe) workflowId: number) {
    return this.boardService.getStats(workflowId);
  }
}
