const fs = require('node:fs/promises');
const path = require('node:path');

const { getPurchaseScriptKeys } = require('./keys');

const PURCHASE_SCRIPT_RESULTS = Object.freeze({
  SUCCESS: 'SUCCESS',
  ALREADY_PURCHASED: 'ALREADY_PURCHASED',
  SOLD_OUT: 'SOLD_OUT',
  NOT_STARTED: 'NOT_STARTED',
  ENDED: 'ENDED',
});

const VALID_PURCHASE_SCRIPT_RESULTS = new Set(Object.values(PURCHASE_SCRIPT_RESULTS));

let purchaseScriptSourcePromise;

async function loadPurchaseScriptSource() {
  if (!purchaseScriptSourcePromise) {
    purchaseScriptSourcePromise = fs.readFile(
      path.resolve(__dirname, 'purchase.lua'),
      'utf8',
    );
  }

  return purchaseScriptSourcePromise;
}

async function runPurchaseScript({
  redisClient,
  userId,
  nowMs,
  saleStartMs,
  saleEndMs,
}) {
  let purchaseScriptSource;
  try {
    purchaseScriptSource = await loadPurchaseScriptSource();
  } catch (error) {
    console.error('Failed to load purchase script:', error);
    purchaseScriptSourcePromise = undefined;
    throw error;
  }
  
  const result = await redisClient.eval(purchaseScriptSource, {
    keys: getPurchaseScriptKeys(),
    arguments: [
      String(userId),
      String(nowMs),
      String(saleStartMs),
      String(saleEndMs),
    ],
  });

  if (!VALID_PURCHASE_SCRIPT_RESULTS.has(result)) {
    throw new Error(`Unexpected purchase script result: ${String(result)}`);
  }

  return result;
}

module.exports = {
  PURCHASE_SCRIPT_RESULTS,
  runPurchaseScript,
};
