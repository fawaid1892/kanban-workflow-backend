import { Module } from '@nestjs/common';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';
import { BoardGateway } from './board.gateway';

@Module({
  controllers: [BoardController],
  providers: [BoardService, BoardGateway],
  exports: [BoardService, BoardGateway],
})
export class BoardModule {}
