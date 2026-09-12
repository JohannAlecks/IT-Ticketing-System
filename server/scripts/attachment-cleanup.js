require('dotenv').config();
const { scanOrphans } = require('../src/modules/attachments/attachment.cleanup');

function parseOptions(args) {
  const options = {};
  for (const arg of args) {
    if (arg === '--execute' && !options.execute) options.execute = true;
    else if (arg === '--writers-stopped' && !options.writersStopped) options.writersStopped = true;
    else if (/^--grace-hours=\d+$/.test(arg) && options.graceHours === undefined) options.graceHours = Number(arg.split('=')[1]);
    else if (/^--batch=\d+$/.test(arg) && options.batch === undefined) options.batch = Number(arg.split('=')[1]);
    else throw new Error('Invalid cleanup argument');
  }
  return options;
}
async function main() {
  let prisma;
  try {
    const options = parseOptions(process.argv.slice(2));
    prisma = require('../src/config/prisma');
    const result = await scanOrphans({ prisma, ...options });
    console.log(JSON.stringify(result));
    process.exitCode = result.exitCode;
  } catch {
    console.error(JSON.stringify({ category: 'CLEANUP_REFUSED_OR_INCOMPLETE', exitCode: 1 }));
    process.exitCode = 1;
  } finally {
    if (prisma) {
      try { await prisma.$disconnect(); } catch {
        console.error(JSON.stringify({ category: 'CLEANUP_CONNECTION_CLOSE_FAILED', exitCode: 1 }));
        process.exitCode = 1;
      }
    }
  }
}
if (require.main === module) void main();
module.exports = { parseOptions };
