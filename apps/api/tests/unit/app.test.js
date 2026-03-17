import { describe, expect, it } from 'vitest';
import request from 'supertest';

const app = require('../../src/app');

describe('app', () => {
  it('returns JSON from the health endpoint', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns a JSON 404 payload for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'not_found',
        message: 'Route not found',
      },
    });
  });

  it('returns a JSON 400 payload for malformed JSON bodies', async () => {
    const response = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'invalid_json',
        message: 'Request body must be valid JSON',
      },
    });
  });
});
