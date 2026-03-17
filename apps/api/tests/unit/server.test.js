import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function loadFreshModule(modulePath) {
  const resolvedPath = require.resolve(modulePath);
  delete require.cache[resolvedPath];
  return require(modulePath);
}

describe('server lifecycle', () => {
  let app;
  let redis;
  let postgres;
  let processOnceSpy;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    delete require.cache[require.resolve('../../src/server')];
    app = loadFreshModule('../../src/app');
    redis = loadFreshModule('../../src/lib/redis');
    postgres = loadFreshModule('../../src/lib/postgres');
    processOnceSpy = vi.spyOn(process, 'once').mockImplementation(() => process);
  });

  afterEach(() => {
    processOnceSpy.mockRestore();
  });

  it('returns the in-flight shutdown promise to concurrent callers', async () => {
    let closeServer;
    let releaseRedis;
    let releasePostgres;
    const fakeServer = {
      close: vi.fn((callback) => {
        closeServer = callback;
      }),
      once: vi.fn(),
    };

    vi.spyOn(app, 'listen').mockImplementation((_port, callback) => {
      callback();
      return fakeServer;
    });
    vi.spyOn(postgres, 'verifyPostgresConnection').mockResolvedValue({});
    const disconnectRedis = vi.spyOn(redis, 'disconnectRedis').mockImplementation(
      () => new Promise((resolve) => {
        releaseRedis = resolve;
      }),
    );
    const disconnectPostgres = vi.spyOn(postgres, 'disconnectPostgres').mockImplementation(
      () => new Promise((resolve) => {
        releasePostgres = resolve;
      }),
    );
    vi.spyOn(redis, 'connectRedis').mockResolvedValue({});

    const { startServer, shutdown } = loadFreshModule('../../src/server');

    await startServer();

    const firstShutdown = shutdown('SIGINT');
    let secondShutdownCompleted = false;
    const secondShutdown = shutdown('SIGTERM').then(() => {
      secondShutdownCompleted = true;
    });

    await Promise.resolve();
    expect(secondShutdownCompleted).toBe(false);

    closeServer();
    await Promise.resolve();
    releaseRedis();
    releasePostgres();

    await Promise.all([firstShutdown, secondShutdown]);

    expect(fakeServer.close).toHaveBeenCalledTimes(1);
    expect(disconnectRedis).toHaveBeenCalledTimes(1);
    expect(disconnectPostgres).toHaveBeenCalledTimes(1);
  });

  it('cleans up Redis and Postgres when listen fails after dependencies connect', async () => {
    const listenError = new Error('listen EADDRINUSE: address already in use :::3000');

    vi.spyOn(app, 'listen').mockImplementation(() => ({
      once: vi.fn((eventName, handler) => {
        if (eventName === 'error') {
          setTimeout(() => handler(listenError), 0);
        }
      }),
    }));
    vi.spyOn(postgres, 'verifyPostgresConnection').mockResolvedValue({});
    vi.spyOn(redis, 'connectRedis').mockResolvedValue({});
    const disconnectRedis = vi.spyOn(redis, 'disconnectRedis').mockResolvedValue();
    const disconnectPostgres = vi.spyOn(postgres, 'disconnectPostgres').mockResolvedValue();

    const { startServer } = loadFreshModule('../../src/server');

    await expect(startServer()).rejects.toThrow(listenError.message);
    expect(disconnectRedis).toHaveBeenCalledTimes(1);
    expect(disconnectPostgres).toHaveBeenCalledTimes(1);
  });
});
