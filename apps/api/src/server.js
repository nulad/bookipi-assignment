 const app = require('./app');
const config = require('./config/env');
const { connectRedis, disconnectRedis } = require('./lib/redis');
const { verifyPostgresConnection, disconnectPostgres } = require('./lib/postgres');

let server;
let isShuttingDown = false;

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

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
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

  await Promise.allSettled([
    disconnectRedis(),
    disconnectPostgres(),
  ]);
}

async function startServer() {
  try {
    await verifyDependencies();

    server = app.listen(config.port, () => {
      console.log(`API server listening on port ${config.port}`);
    });

    process.once('SIGINT', async () => {
      try {
        await shutdown('SIGINT');
        process.exit(0);
      } catch (error) {
        console.error('Failed to shut down cleanly:', error.message);
        process.exit(1);
      }
    });

    process.once('SIGTERM', async () => {
      try {
        await shutdown('SIGTERM');
        process.exit(0);
      } catch (error) {
        console.error('Failed to shut down cleanly:', error.message);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start API server. Verify infrastructure connectivity and environment configuration.');
    console.error(error.message);

    await Promise.allSettled([
      disconnectRedis(),
      disconnectPostgres(),
    ]);

    process.exit(1);
  }
}

startServer();

module.exports = {
  startServer,
};
