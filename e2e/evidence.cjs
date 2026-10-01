const fs = require('node:fs');
const path = require('node:path');
// Call only with the existing allowlisted/sanitized reporter records. Preserve
// verification evidence across terminal disconnections, never raw browser logs.
function emit(run, record) {
  if (/^[a-f0-9-]{36}$/.test(run || '')) {
    const directory = path.join(__dirname, 'artifacts', 'verification');
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, `${run}.jsonl`), JSON.stringify(record) + '\n');
  }
  console.log(JSON.stringify(record));
}
module.exports = { emit };
