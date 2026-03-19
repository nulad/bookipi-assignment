import http from 'k6/http';
import { fail } from 'k6';
import { Counter, Rate } from 'k6/metrics';

export function parseIntegerEnv(name, defaultValue) {
  const rawValue = __ENV[name];

  if (rawValue === undefined || rawValue === '') {
    return defaultValue;
  }

  if (!/^\d+$/.test(rawValue.trim())) {
    throw new Error(`${name} must be a positive integer when provided`);
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer when provided`);
  }

  return parsedValue;
}

function normalizePath(path) {
  if (!path || path === '/') {
    return '';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function createPurchaseStressConfig({
  rateEnvName,
  defaultRate,
  durationEnvName,
  defaultDuration = '15s',
}) {
  const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const purchasePath = __ENV.PURCHASE_PATH || '/purchase';
  const saleStatusPath = __ENV.SALE_STATUS_PATH || '/sale-status';
  const rate = parseIntegerEnv(rateEnvName, defaultRate);
  const preAllocatedVUs = parseIntegerEnv('PRE_ALLOCATED_VUS', 200);
  const maxVUs = parseIntegerEnv('MAX_VUS', 1000);
  const expectedMaxP95Ms = parseIntegerEnv('EXPECTED_MAX_P95_MS', 750);
  const expectedMaxP99Ms = parseIntegerEnv('EXPECTED_MAX_P99_MS', 1500);
  const duration = __ENV[durationEnvName] || defaultDuration;

  if (maxVUs < preAllocatedVUs) {
    throw new Error('MAX_VUS must be greater than or equal to PRE_ALLOCATED_VUS');
  }

  return {
    purchaseUrl: `${baseUrl}${normalizePath(purchasePath)}`,
    saleStatusUrl: `${baseUrl}${normalizePath(saleStatusPath)}`,
    rate,
    duration,
    preAllocatedVUs,
    maxVUs,
    expectedMaxP95Ms,
    expectedMaxP99Ms,
    jsonHeaders: {
      'Content-Type': 'application/json',
    },
  };
}

export function createPurchaseMetrics(prefix) {
  return {
    attempts: new Counter(`${prefix}_attempts`),
    successes: new Counter(`${prefix}_successes`),
    soldOut: new Counter(`${prefix}_sold_out`),
    alreadyPurchased: new Counter(`${prefix}_already_purchased`),
    saleNotStarted: new Counter(`${prefix}_sale_not_started`),
    saleEnded: new Counter(`${prefix}_sale_ended`),
    httpErrors: new Counter(`${prefix}_http_errors`),
    unexpectedStatus: new Counter(`${prefix}_unexpected_status`),
    http200Rate: new Rate(`${prefix}_http_200_rate`),
    payloadShapeRate: new Rate(`${prefix}_payload_shape_rate`),
  };
}

export function createConstantArrivalRateOptions({
  scenarioName,
  execName,
  rate,
  duration,
  preAllocatedVUs,
  maxVUs,
  expectedMaxP95Ms,
  expectedMaxP99Ms,
  metricPrefix,
  extraThresholds = {},
}) {
  return {
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    scenarios: {
      [scenarioName]: {
        executor: 'constant-arrival-rate',
        exec: execName,
        rate,
        timeUnit: '1s',
        duration,
        preAllocatedVUs,
        maxVUs,
      },
    },
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: [`p(95)<${expectedMaxP95Ms}`, `p(99)<${expectedMaxP99Ms}`],
      [`${metricPrefix}_http_200_rate`]: ['rate==1'],
      [`${metricPrefix}_payload_shape_rate`]: ['rate==1'],
      [`${metricPrefix}_http_errors`]: ['count==0'],
      [`${metricPrefix}_unexpected_status`]: ['count==0'],
      [`${metricPrefix}_sale_not_started`]: ['count==0'],
      [`${metricPrefix}_sale_ended`]: ['count==0'],
      ...extraThresholds,
    },
  };
}

export function setupActiveSaleRun({
  saleStatusUrl,
  scenarioLabel,
  minimumRemainingStock,
  minimumRemainingStockLabel,
  buildStartMessage,
}) {
  const response = http.get(saleStatusUrl, {
    headers: {
      Accept: 'application/json',
    },
    tags: {
      endpoint: 'sale-status',
    },
  });

  if (response.status !== 200) {
    fail(
      `Failed to read ${saleStatusUrl}. ` +
      `Expected HTTP 200 but got ${response.status}. Response body: ${response.body}`,
    );
  }

  let saleStatus;

  try {
    saleStatus = response.json();
  } catch (error) {
    fail(`Failed to parse JSON from ${saleStatusUrl}: ${error.message}`);
  }

  if (saleStatus.status !== 'active') {
    fail(
      `${scenarioLabel} requires an active sale. ${saleStatusUrl} returned ` +
      `status=${saleStatus.status} remainingStock=${saleStatus.remainingStock} at ${new Date().toISOString()}. ` +
      'Update SALE_START_TIME and SALE_END_TIME so the current window is active, restart the API, run "npm run sale:init:api", then retry.',
    );
  }

  if (
    minimumRemainingStock !== undefined
    && saleStatus.remainingStock < minimumRemainingStock
  ) {
    fail(
      `${scenarioLabel} requires remainingStock >= ${minimumRemainingStockLabel}. ${saleStatusUrl} returned ` +
      `remainingStock=${saleStatus.remainingStock}, but ${minimumRemainingStockLabel}=${minimumRemainingStock}. ` +
      'Reinitialize the sale with more stock or lower the configured threshold, then retry.',
    );
  }

  const runId = Date.now();

  console.log(buildStartMessage({ runId, saleStatus }));

  return {
    runId,
  };
}

function recordPurchaseStatus(metrics, status) {
  switch (status) {
    case 'success':
      metrics.successes.add(1);
      return;
    case 'sold_out':
      metrics.soldOut.add(1);
      return;
    case 'already_purchased':
      metrics.alreadyPurchased.add(1);
      return;
    case 'sale_not_started':
      metrics.saleNotStarted.add(1);
      return;
    case 'sale_ended':
      metrics.saleEnded.add(1);
      return;
    default:
      metrics.unexpectedStatus.add(1);
  }
}

function isPurchasePayloadValid(body, expectedUserId) {
  if (!body || typeof body !== 'object' || typeof body.status !== 'string') {
    return false;
  }

  if (body.status === 'success') {
    return Boolean(
      body.purchase
      && body.purchase.userId === expectedUserId
      && body.purchase.saleId !== undefined
      && typeof body.purchase.purchasedAt === 'string',
    );
  }

  return body.purchase === undefined;
}

export function executePurchaseAttempt({
  purchaseUrl,
  jsonHeaders,
  userId,
  metrics,
  tags = {},
}) {
  metrics.attempts.add(1);

  const response = http.post(
    purchaseUrl,
    JSON.stringify({ userId }),
    {
      headers: jsonHeaders,
      tags: {
        endpoint: 'purchase',
        ...tags,
      },
    },
  );

  const isHttp200 = response.status === 200;
  metrics.http200Rate.add(isHttp200);

  if (!isHttp200) {
    metrics.httpErrors.add(1);
    metrics.payloadShapeRate.add(false);
    return;
  }

  let body;

  try {
    body = response.json();
  } catch (_error) {
    metrics.unexpectedStatus.add(1);
    metrics.payloadShapeRate.add(false);
    return;
  }

  recordPurchaseStatus(metrics, body.status);
  metrics.payloadShapeRate.add(isPurchasePayloadValid(body, userId));
}
