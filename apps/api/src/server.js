const app = require('./app');
const config = require('./config/env');
const { connectRedis, disconnectRedis } = require('./lib/redis');
const { verifyPostgresConnection, disconnectPostgres } = require('./lib/postgres');

let server;
let isShuttingDown = false;
let signalHandlersRegistered = false;
let shutdownPromise;

async function verifyDependencies() {
  try {
    await verifyPostgresConnection();
    console.log('Connected to Postgres');
  } catch (error) {
    throw new Error(`Postgres connection failed (${config.postgresUrl}): ${error.message}`);
  }

  try {
    await connectRedis();
    console.log('Connected to Redis');
  } catch (error) {
    throw new Error(`Redis connection failed (${config.redisUrl}): ${error.message}`);
  }
}

async function cleanupDependencies() {
  await Promise.allSettled([
    disconnectRedis(),
    disconnectPostgres(),
  ]);
}

async function shutdown(signal) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown = true;
  shutdownPromise = (async () => {
    console.log(`Received ${signal}. Shutting down API server...`);

    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            if (error.message === 'Server is not running.') {
              server = undefined;
              resolve();
              return;
            }

            reject(error);
            return;
          }

          server = undefined;
          resolve();
        });
      });
    }

    await cleanupDependencies();
  })();

  try {
    await shutdownPromise;
  } finally {
    shutdownPromise = undefined;
    isShuttingDown = false;
  }
}

function registerSignalHandlers() {
  if (signalHandlersRegistered) {
    return;
  }

  const createSignalHandler = (signal) => async () => {
    try {
      await shutdown(signal);
      process.exit(0);
    } catch (error) {
      console.error('Failed to shut down cleanly:', error.message);
      process.exit(1);
    }
  };

  process.once('SIGINT', createSignalHandler('SIGINT'));
  process.once('SIGTERM', createSignalHandler('SIGTERM'));
  signalHandlersRegistered = true;
}

async function startServer() {
  if (server) {
    throw new Error('Server is already running');
  }

  isShuttingDown = false;
  try {
    await verifyDependencies();

    await new Promise((resolve, reject) => {
      const nextServer = app.listen(config.port, () => {
        console.log(`API server listening on port ${config.port}`);
        resolve();
      });

      nextServer.once('error', (error) => {
        server = undefined;
        reject(error);
      });

      server = nextServer;
    });

    registerSignalHandlers();
    return server;
  } catch (error) {
    server = undefined;
    await cleanupDependencies();
    throw error;
  }
}

async function main() {
  try {
    await startServer();
  } catch (error) {
    console.error('Failed to start API server. Verify infrastructure connectivity and environment configuration.');
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  main,
  startServer,
  shutdown,
};
