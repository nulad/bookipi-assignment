const config = require("../config/env");
const {redisClient} = require("../lib/redis");
const {createPurchase : newPurchase } = require("../repositories/purchase.repository");
const {PURCHASE_SCRIPT_RESULTS, runPurchaseScript : purchaseScript} = require("../redis/purchase-script");
const {normalizeUserId : normalizeScript} = require("../utils/normalize-user-id");


const luaStatusMap = {
    [PURCHASE_SCRIPT_RESULTS.SUCCESS]: "success",
    [PURCHASE_SCRIPT_RESULTS.ALREADY_PURCHASED]: "already_purchased",
    [PURCHASE_SCRIPT_RESULTS.SOLD_OUT]: "sold_out",
    [PURCHASE_SCRIPT_RESULTS.NOT_STARTED]: "sale_not_started",
    [PURCHASE_SCRIPT_RESULTS.ENDED]: "sale_ended"
};

async function purchase({saleId, userId, now = new Date() }, deps = {}) {
    const redis = deps.redisClient || redisClient;
    const saleConfig = deps.saleConfig || config.sale;
    const normalizeUserId = deps.normalizeUserId || normalizeScript;
    const runPurchaseScript = deps.runPurchaseScript || purchaseScript;
    const createPurchase = deps.createPurchase || newPurchase;
    
    // ensure saleId exists
    if (saleId == null) throw new Error("saleId is required");
    const normalizedUserId = normalizeUserId(userId);

    const nowMs = now.getTime();
    const saleStartMs = saleConfig.startTime.getTime();
    const saleEndMs = saleConfig.endTime.getTime();

    const result = await runPurchaseScript({
        redisClient: redis,
        userId: normalizedUserId,
        nowMs,
        saleStartMs,
        saleEndMs
    });
    const status = luaStatusMap[result];

    if (!status) {
        throw new Error(`Unexpected purchase script result: ${String(result)}`);
    }

    if (result === PURCHASE_SCRIPT_RESULTS.SUCCESS) {
        const purchase = await createPurchase({
            saleId,
            userId: normalizedUserId
        });

        return { status, purchase};
    }
    
    return { status };
    
}

module.exports = {
  purchase,
};
