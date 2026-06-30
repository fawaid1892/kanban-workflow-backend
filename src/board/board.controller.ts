import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { BoardService } from './board.service';

@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get('tasks')
  getTasks(
    @Query('status') status?: string,
    @Query('assignee') assignee?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.boardService.getTasks({
      status,
      assignee,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('tasks/:id')
  getTaskDetail(@Param('id') id: string) {
    return this.boardService.getTaskDetail(id);
  }

  @Get('stats')
  getStats() {
    return this.boardService.getStats();
  }
}
