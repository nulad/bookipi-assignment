import exec from 'k6/execution';
import {
  createConstantArrivalRateOptions,
  createPurchaseMetrics,
  createPurchaseStressConfig,
  executePurchaseAttempt,
  setupActiveSaleRun,
} from './helpers/purchase-stress.js';

const config = createPurchaseStressConfig({
  rateEnvName: 'BURST_RATE',
  defaultRate: 250,
  durationEnvName: 'BURST_DURATION',
});

const metrics = createPurchaseMetrics('purchase');

export const options = {
  ...createConstantArrivalRateOptions({
    scenarioName: 'purchase_burst',
    execName: 'attemptPurchase',
    rate: config.rate,
    duration: config.duration,
    preAllocatedVUs: config.preAllocatedVUs,
    maxVUs: config.maxVUs,
    expectedMaxP95Ms: config.expectedMaxP95Ms,
    expectedMaxP99Ms: config.expectedMaxP99Ms,
    metricPrefix: 'purchase',
    extraThresholds: {
      purchase_already_purchased: ['count==0'],
    },
  }),
};

function buildUserId(runId) {
  return `burst-user-${runId}-${exec.scenario.iterationInTest}@example.com`;
}

export function setup() {
  return setupActiveSaleRun({
    saleStatusUrl: config.saleStatusUrl,
    scenarioLabel: 'Burst test',
    buildStartMessage: ({ saleStatus }) => (
      `Starting purchase burst against ${config.purchaseUrl} with ${config.rate} iterations/s for ${config.duration}. ` +
      `Initial remaining stock: ${saleStatus.remainingStock}.`
    ),
  });
}

export function attemptPurchase(data) {
  const userId = buildUserId(data.runId);
  executePurchaseAttempt({
    purchaseUrl: config.purchaseUrl,
    jsonHeaders: config.jsonHeaders,
    userId,
    metrics,
  });
}

export default attemptPurchase;
