import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Kanban Workflow Builder (e2e)', () => {
  let app: INestApplication<App>;
  let workflowId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health ──

  describe('Health', () => {
    it('GET /api/health → 200', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });

  // ── Workflows CRUD ──

  describe('Workflows', () => {
    it('POST /api/workflows → 201', () => {
      return request(app.getHttpServer())
        .post('/api/workflows')
        .send({ name: 'Test Workflow', description: 'E2E test' })
        .expect(201)
        .expect((res) => {
          expect(res.body.name).toBe('Test Workflow');
          workflowId = res.body.id;
        });
    });

    it('GET /api/workflows → 200', () => {
      return request(app.getHttpServer())
        .get('/api/workflows')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('GET /api/workflows/:id → 200', () => {
      return request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(workflowId);
        });
    });

    it('PUT /api/workflows/:id → 200', () => {
      return request(app.getHttpServer())
        .put(`/api/workflows/${workflowId}`)
        .send({ name: 'Updated Workflow' })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Updated Workflow');
        });
    });
  });

  // ── Stages ──

  describe('Stages', () => {
    let stageId: number;

    it('POST /api/workflows/:id/stages → 201', () => {
      return request(app.getHttpServer())
        .post(`/api/workflows/${workflowId}/stages`)
        .send({
          titleTemplate: 'Implement {feature}',
          roleSlug: 'backend',
          roleLabel: 'Backend',
          initialStatus: 'todo',
          sortOrder: 0,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.roleSlug).toBe('backend');
          stageId = res.body.id;
        });
    });

    it('GET /api/workflows/:id/stages → 200', () => {
      return request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}/stages`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
        });
    });
  });

  // ── Favorites & Archive ──

  describe('Favorites & Archive', () => {
    it('PUT /api/workflows/:id/favorite → 200', () => {
      return request(app.getHttpServer())
        .put(`/api/workflows/${workflowId}/favorite`)
        .expect(200)
        .expect((res) => {
          expect(typeof res.body.isFavorite).toBe('boolean');
        });
    });

    it('PUT /api/workflows/:id/archive → 200', () => {
      return request(app.getHttpServer())
        .put(`/api/workflows/${workflowId}/archive`)
        .expect(200)
        .expect((res) => {
          expect(typeof res.body.isArchived).toBe('boolean');
        });
    });
  });

  // ── Tags ──

  describe('Tags', () => {
    it('POST /api/workflows/:id/tags → 201', () => {
      return request(app.getHttpServer())
        .post(`/api/workflows/${workflowId}/tags`)
        .send({ tag: 'test-tag' })
        .expect(201)
        .expect((res) => {
          expect(res.body.tag).toBe('test-tag');
        });
    });

    it('GET /api/workflows/:id/tags → 200', () => {
      return request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}/tags`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  // ── Dashboard ──

  describe('Dashboard', () => {
    it('GET /api/dashboard → 200', () => {
      return request(app.getHttpServer())
        .get('/api/dashboard')
        .expect(200)
        .expect((res) => {
          expect(typeof res.body.totalWorkflows).toBe('number');
          expect(typeof res.body.totalRuns).toBe('number');
        });
    });
  });

  // ── Analytics ──

  describe('Analytics', () => {
    it('GET /api/workflows/:id/analytics → 200', () => {
      return request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}/analytics`)
        .expect(200)
        .expect((res) => {
          expect(typeof res.body.totalRuns).toBe('number');
        });
    });
  });

  // ── Versions ──

  describe('Versions', () => {
    it('POST /api/workflows/:id/versions → 201', () => {
      return request(app.getHttpServer())
        .post(`/api/workflows/${workflowId}/versions`)
        .send({ changeSummary: 'Initial version' })
        .expect(201);
    });

    it('GET /api/workflows/:id/versions → 200', () => {
      return request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}/versions`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  // ── Gantt ──

  describe('Gantt', () => {
    it('GET /api/workflows/:id/gantt → 200', () => {
      return request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}/gantt`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.stages)).toBe(true);
          expect(typeof res.body.totalDays).toBe('number');
        });
    });
  });

  // ── Export ──

  describe('Export', () => {
    it('GET /api/workflows/:id/export → 200', () => {
      return request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}/export`)
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBeDefined();
          expect(Array.isArray(res.body.stages)).toBe(true);
        });
    });
  });

  // ── Search ──

  describe('Search', () => {
    it('GET /api/workflows/search?q=Updated → 200', () => {
      return request(app.getHttpServer())
        .get('/api/workflows/search?q=Updated')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  // ── Cleanup ──

  describe('Cleanup', () => {
    it('DELETE /api/workflows/:id → 200', () => {
      return request(app.getHttpServer())
        .delete(`/api/workflows/${workflowId}`)
        .expect(200);
    });
  });
});
