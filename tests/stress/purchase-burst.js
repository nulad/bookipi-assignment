import http from 'k6/http';
import exec from 'k6/execution';
import { fail } from 'k6';
import { Counter, Rate } from 'k6/metrics';

function parseIntegerEnv(name, defaultValue) {
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

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const PURCHASE_PATH = __ENV.PURCHASE_PATH || '/purchase';
const SALE_STATUS_PATH = __ENV.SALE_STATUS_PATH || '/sale-status';
const BURST_RATE = parseIntegerEnv('BURST_RATE', 250);
const PRE_ALLOCATED_VUS = parseIntegerEnv('PRE_ALLOCATED_VUS', 200);
const MAX_VUS = parseIntegerEnv('MAX_VUS', 1000);
const EXPECTED_MAX_P95_MS = parseIntegerEnv('EXPECTED_MAX_P95_MS', 750);
const EXPECTED_MAX_P99_MS = parseIntegerEnv('EXPECTED_MAX_P99_MS', 1500);
const BURST_DURATION = __ENV.BURST_DURATION || '15s';

if (MAX_VUS < PRE_ALLOCATED_VUS) {
  throw new Error('MAX_VUS must be greater than or equal to PRE_ALLOCATED_VUS');
}

const PURCHASE_URL = `${BASE_URL}${normalizePath(PURCHASE_PATH)}`;
const SALE_STATUS_URL = `${BASE_URL}${normalizePath(SALE_STATUS_PATH)}`;
const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

const purchaseAttempts = new Counter('purchase_attempts');
const purchaseSuccesses = new Counter('purchase_successes');
const purchaseSoldOut = new Counter('purchase_sold_out');
const purchaseAlreadyPurchased = new Counter('purchase_already_purchased');
const purchaseSaleNotStarted = new Counter('purchase_sale_not_started');
const purchaseSaleEnded = new Counter('purchase_sale_ended');
const purchaseHttpErrors = new Counter('purchase_http_errors');
const purchaseUnexpectedStatus = new Counter('purchase_unexpected_status');
const purchaseHttp200Rate = new Rate('purchase_http_200_rate');
const purchasePayloadShapeRate = new Rate('purchase_payload_shape_rate');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    purchase_burst: {
      executor: 'constant-arrival-rate',
      exec: 'attemptPurchase',
      rate: BURST_RATE,
      timeUnit: '1s',
      duration: BURST_DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [`p(95)<${EXPECTED_MAX_P95_MS}`, `p(99)<${EXPECTED_MAX_P99_MS}`],
    purchase_http_200_rate: ['rate==1'],
    purchase_payload_shape_rate: ['rate==1'],
    purchase_http_errors: ['count==0'],
    purchase_unexpected_status: ['count==0'],
    purchase_already_purchased: ['count==0'],
    purchase_sale_not_started: ['count==0'],
    purchase_sale_ended: ['count==0'],
  },
};

function buildUserId(runId) {
  return `burst-user-${runId}-${exec.scenario.iterationInTest}@example.com`;
}

function recordPurchaseStatus(status) {
  switch (status) {
    case 'success':
      purchaseSuccesses.add(1);
      return;
    case 'sold_out':
      purchaseSoldOut.add(1);
      return;
    case 'already_purchased':
      purchaseAlreadyPurchased.add(1);
      return;
    case 'sale_not_started':
      purchaseSaleNotStarted.add(1);
      return;
    case 'sale_ended':
      purchaseSaleEnded.add(1);
      return;
    default:
      purchaseUnexpectedStatus.add(1);
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

export function setup() {
  const response = http.get(SALE_STATUS_URL, {
    headers: {
      Accept: 'application/json',
    },
    tags: {
      endpoint: 'sale-status',
    },
  });

  if (response.status !== 200) {
    fail(
      `Failed to read ${SALE_STATUS_URL}. ` +
      `Expected HTTP 200 but got ${response.status}. Response body: ${response.body}`,
    );
  }

  let saleStatus;

  try {
    saleStatus = response.json();
  } catch (error) {
    fail(`Failed to parse JSON from ${SALE_STATUS_URL}: ${error.message}`);
  }

  if (saleStatus.status !== 'active') {
    fail(
      `Burst test requires an active sale. ${SALE_STATUS_URL} returned ` +
      `status=${saleStatus.status} remainingStock=${saleStatus.remainingStock} at ${new Date().toISOString()}. ` +
      'Update SALE_START_TIME and SALE_END_TIME so the current window is active, restart the API, run "npm run sale:init:api", then retry.',
    );
  }

  const runId = Date.now();

  console.log(
    `Starting purchase burst against ${PURCHASE_URL} with ${BURST_RATE} iterations/s for ${BURST_DURATION}. ` +
    `Initial remaining stock: ${saleStatus.remainingStock}.`,
  );

  return {
    runId,
  };
}

export function attemptPurchase(data) {
  const userId = buildUserId(data.runId);
  purchaseAttempts.add(1);

  const response = http.post(
    PURCHASE_URL,
    JSON.stringify({ userId }),
    {
      headers: JSON_HEADERS,
      tags: {
        endpoint: 'purchase',
      },
    },
  );

  const isHttp200 = response.status === 200;
  purchaseHttp200Rate.add(isHttp200);

  if (!isHttp200) {
    purchaseHttpErrors.add(1);
    purchasePayloadShapeRate.add(false);
    return;
  }

  let body;

  try {
    body = response.json();
  } catch (_error) {
    purchaseUnexpectedStatus.add(1);
    purchasePayloadShapeRate.add(false);
    return;
  }

  recordPurchaseStatus(body.status);
  purchasePayloadShapeRate.add(isPurchasePayloadValid(body, userId));
}

export default attemptPurchase;
