const TEST_LOCK_KEY = 'flashsale:test:lock';
const TEST_LOCK_TTL_MS = 30_000;
const RETRY_DELAY_MS = 50;

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function acquireRedisTestLock(redisClient) {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  while (true) {
    const lockAcquired = await redisClient.set(TEST_LOCK_KEY, token, {
      NX: true,
      PX: TEST_LOCK_TTL_MS,
    });

    if (lockAcquired === 'OK') {
      return token;
    }

    await sleep(RETRY_DELAY_MS);
  }
}

async function releaseRedisTestLock(redisClient, token) {
  await redisClient.eval(
    `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end

      return 0
    `,
    {
      keys: [TEST_LOCK_KEY],
      arguments: [token],
    },
  );
}

module.exports = {
  acquireRedisTestLock,
  releaseRedisTestLock,
};
