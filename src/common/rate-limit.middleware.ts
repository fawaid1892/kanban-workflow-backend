import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly store = new Map<string, RateLimitEntry>();

  // 100 requests per minute per IP
  private readonly maxRequests = 100;
  private readonly windowMs = 60_000;

  use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = this.store.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.store.set(ip, entry);
    }

    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, this.maxRequests - entry.count),
    );
    res.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(entry.resetAt / 1000),
    );

    if (entry.count > this.maxRequests) {
      this.logger.warn(`Rate limit exceeded for IP: ${ip}`);
      throw new HttpException(
        {
          statusCode: 429,
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    next();
  }
}
