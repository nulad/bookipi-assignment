const { connectRedis, disconnectRedis } = require('../lib/redis');
const { verifyPostgresConnection, disconnectPostgres } = require('../lib/postgres');
const {
  runPurchasePersistenceReconciliation,
} = require('../services/purchase-reconciliation.service');

function parseCliArgs(argv) {
  let apply = false;
  let limit;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      return {
        help: true,
      };
    }

    if (arg === '--apply' || arg === 'apply') {
      apply = true;
      continue;
    }

    if (arg === 'inspect') {
      apply = false;
      continue;
    }

    if (arg === '--limit') {
      const value = argv[index + 1];

      if (value === undefined) {
        throw new Error('Missing value for --limit');
      }

      if (!/^\d+$/.test(value) || Number.parseInt(value, 10) <= 0) {
        throw new Error('--limit must be a positive integer');
      }

      limit = Number.parseInt(value, 10);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    apply,
    limit,
  };
}

function getUsageText() {
  return [
    'Usage:',
    '  node scripts/reconcile-purchase-persistence-failures.js [inspect] [--limit N]',
    '  node scripts/reconcile-purchase-persistence-failures.js --apply [--limit N]',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);

  if (args.help) {
    console.log(getUsageText());

    return {
      help: true,
    };
  }

  try {
    await verifyPostgresConnection();
    await connectRedis();

    const summary = await runPurchasePersistenceReconciliation({
      apply: args.apply,
      limit: args.limit,
    });

    console.log(JSON.stringify(summary, null, 2));

    if (summary.error) {
      process.exitCode = 1;
    }

    return summary;
  } finally {
    await Promise.allSettled([
      disconnectRedis(),
      disconnectPostgres(),
    ]);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Failed to reconcile purchase persistence failures: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  getUsageText,
  main,
  parseCliArgs,
};
