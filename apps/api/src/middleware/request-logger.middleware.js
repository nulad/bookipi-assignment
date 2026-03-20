function formatRequestDurationMs(startTime, endTime) {
  return Math.max(0, Math.round(endTime - startTime));
}

function getRequestPath(request) {
  return request.path || request.originalUrl || request.url;
}

function createRequestLogger({ logger = console, now = () => Date.now() } = {}) {
  return function requestLogger(request, response, next) {
    const startTime = now();

    response.once('finish', () => {
      const durationMs = formatRequestDurationMs(startTime, now());

      logger.log(
        `${request.method} ${getRequestPath(request)} ${response.statusCode} ${durationMs}ms`,
      );
    });

    next();
  };
}

module.exports = {
  createRequestLogger,
  formatRequestDurationMs,
  getRequestPath,
};
