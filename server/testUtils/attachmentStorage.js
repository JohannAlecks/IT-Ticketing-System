const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/modules/attachments/attachment.storage');

function fixtureStore() {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'ticketing-attachment-test-'));
  const store = createStore(root);
  function dispose() {
    if (path.dirname(root) !== parent || !path.basename(root).startsWith('ticketing-attachment-test-') ||
        fs.lstatSync(root).isSymbolicLink() || fs.realpathSync(root) !== root) throw new Error('Unsafe synthetic fixture root');
    fs.rmSync(root, { recursive: true, force: true });
    if (fs.existsSync(root)) throw new Error('Synthetic fixture cleanup incomplete');
  }
  return { store, dispose };
}
module.exports = { fixtureStore };
