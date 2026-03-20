import exec from 'k6/execution';
import {
  createConstantArrivalRateOptions,
  createPurchaseMetrics,
  createPurchaseStressConfig,
  executePurchaseAttempt,
  parseIntegerEnv,
  setupActiveSaleRun,
} from './helpers/purchase-stress.js';

const REPEATED_USER_POOL_SIZE = parseIntegerEnv('REPEATED_USER_POOL_SIZE', 25);
const config = createPurchaseStressConfig({
  rateEnvName: 'REPEATED_RATE',
  defaultRate: 250,
  durationEnvName: 'REPEATED_DURATION',
});
const metrics = createPurchaseMetrics('repeated_purchase');

export const options = createConstantArrivalRateOptions({
  scenarioName: 'repeated_user_burst',
  execName: 'attemptRepeatedPurchase',
  rate: config.rate,
  duration: config.duration,
  preAllocatedVUs: config.preAllocatedVUs,
  maxVUs: config.maxVUs,
  expectedMaxP95Ms: config.expectedMaxP95Ms,
  expectedMaxP99Ms: config.expectedMaxP99Ms,
  metricPrefix: 'repeated_purchase',
  extraThresholds: {
    repeated_purchase_already_purchased: ['count>0'],
    repeated_purchase_successes: [`count==${REPEATED_USER_POOL_SIZE}`],
  },
});

function buildUserId(runId) {
  const userIndex = exec.scenario.iterationInTest % REPEATED_USER_POOL_SIZE;
  return `repeat-user-${runId}-${userIndex}@example.com`;
}

export function setup() {
  return setupActiveSaleRun({
    saleStatusUrl: config.saleStatusUrl,
    scenarioLabel: 'Repeated-user test',
    minimumRemainingStock: REPEATED_USER_POOL_SIZE,
    minimumRemainingStockLabel: 'REPEATED_USER_POOL_SIZE',
    buildStartMessage: ({ saleStatus }) => (
      `Starting repeated-user purchase test against ${config.purchaseUrl} with ${config.rate} iterations/s for ${config.duration}. ` +
      `Repeated user pool: ${REPEATED_USER_POOL_SIZE}. Initial remaining stock: ${saleStatus.remainingStock}.`
    ),
  });
}

export function attemptRepeatedPurchase(data) {
  const userId = buildUserId(data.runId);
  executePurchaseAttempt({
    purchaseUrl: config.purchaseUrl,
    jsonHeaders: config.jsonHeaders,
    userId,
    metrics,
    tags: {
      scenario: 'repeated-user',
    },
  });
}

export default attemptRepeatedPurchase;
