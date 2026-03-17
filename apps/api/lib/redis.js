const { createClient } = require('redis');
const config = require('../config/env');

const redisClient = createClient({
  url: config.redisUrl,
});

redisClient.on('error', (error) => {
  console.error('Redis client error:', error.message);
});

async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  await redisClient.ping();

  return redisClient;
}

async function disconnectRedis() {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
}

module.exports = {
  redisClient,
  connectRedis,
  disconnectRedis,
};
