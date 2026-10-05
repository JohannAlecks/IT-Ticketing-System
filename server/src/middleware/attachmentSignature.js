const { Transform } = require('node:stream');
const AppError = require('../utils/AppError');
// A bounded signature check, not malware scanning or a full format parser.
function validPrefix(ext, bytes) {
  const hex = bytes.toString('hex');
  if (ext === '.png') return hex.startsWith('89504e470d0a1a0a');
  if (['.jpg', '.jpeg'].includes(ext)) return hex.startsWith('ffd8ff');
  if (ext === '.webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (ext === '.pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (['.doc', '.xls'].includes(ext)) return hex.startsWith('d0cf11e0a1b11ae1');
  if (['.docx', '.xlsx', '.zip'].includes(ext)) return ['504b0304', '504b0506', '504b0708'].some((signature) => hex.startsWith(signature));
  return !hex.startsWith('4d5a') && !hex.startsWith('7f454c46') && !bytes.subarray(0, 2).equals(Buffer.from('#!')) && !bytes.some((byte) => byte === 0 || (byte < 32 && ![9, 10, 13].includes(byte)));
}
function signatureGuard(ext) {
  let prefix = Buffer.alloc(0); let validated = false;
  const invalid = () => new AppError('Attachment content does not match its supported type', 422);
  return new Transform({
    transform(chunk, encoding, done) {
      if (validated) return done(null, chunk);
      const needed = Math.min(32 - prefix.length, chunk.length);
      prefix = Buffer.concat([prefix, chunk.subarray(0, needed)]);
      if (prefix.length < 32) return done();
      if (!validPrefix(ext, prefix)) return done(invalid());
      validated = true; this.push(prefix); done(null, chunk.subarray(needed));
    },
    flush(done) {
      if (!validated) {
        if (!validPrefix(ext, prefix)) return done(invalid());
        this.push(prefix);
      }
      done();
    },
  });
}
module.exports = { signatureGuard, validPrefix };
