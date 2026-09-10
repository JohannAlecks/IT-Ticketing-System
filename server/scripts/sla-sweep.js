#!/usr/bin/env node
// Process-local only: no environment file is changed. Prisma must not emit
// connection details before the command's redacted error handler runs.
process.env.SLA_SWEEP_QUIET = '1';

function integerOption(name, maximum) {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  if (!arg) return undefined;
  const value = Number(arg.slice(name.length + 1));
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    const error = new Error('invalid_argument');
    error.code = 'INVALID_ARGUMENT';
    throw error;
  }
  return value;
}

function safeErrorCategory(error) {
  if (error?.code === 'INVALID_ARGUMENT') return 'INVALID_ARGUMENT';
  if (['P1000', 'P1001', 'P1002', 'P2024', 'P2028', 'P2034'].includes(error?.code)) return error.code;
  return 'SWEEP_FAILED';
}

async function main() {
  let prisma;
  try {
    const batchSize = integerOption('--batch-size', 100);
    const maxBatches = integerOption('--max-batches', 20);
    const cursor = process.argv.find((arg) => arg.startsWith('--after-id='));
    const afterId = cursor ? cursor.slice('--after-id='.length) : null;
    if ((afterId !== null && !/^[a-zA-Z0-9-]{1,100}$/.test(afterId)) || process.argv.slice(2).some((arg) => !/^--(batch-size|max-batches|after-id)=/.test(arg))) {
      const error = new Error('invalid_argument');
      error.code = 'INVALID_ARGUMENT';
      throw error;
    }
    prisma = require('../src/config/prisma');
    const { runSweep } = require('../src/modules/sla/sla.sweep');
    const result = await runSweep({ batchSize, maxBatches, afterId });
    console.log(JSON.stringify({ event: 'sla_sweep_completed', ...result }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'sla_sweep_failed', error: safeErrorCategory(error) }));
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (require.main === module) main();
module.exports = { safeErrorCategory };
