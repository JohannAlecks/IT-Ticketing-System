const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { store, UPLOAD_ROOT } = require('../modules/attachments/attachment.storage');
const AppError = require('../utils/AppError');
const env = require('../config/env');

const MAX_FILE_SIZE_BYTES = env.MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

// Whitelist by MIME type AND extension — never trust extension alone, and
// never trust the client-supplied MIME type alone either (multer reads it
// from the multipart header, which the client controls). Both must match
// an allowed pair, which blocks e.g. a renamed .exe claiming to be a PDF's
// content-type, and blocks a real PDF renamed to something with a spoofed
// extension.
const ALLOWED_TYPES = [
  { mime: 'image/png', ext: '.png' },
  { mime: 'image/jpeg', ext: '.jpg' },
  { mime: 'image/jpeg', ext: '.jpeg' },
  { mime: 'image/webp', ext: '.webp' },
  { mime: 'application/pdf', ext: '.pdf' },
  { mime: 'application/msword', ext: '.doc' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  { mime: 'application/vnd.ms-excel', ext: '.xls' },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  { mime: 'text/plain', ext: '.txt' },
  { mime: 'text/csv', ext: '.csv' },
  { mime: 'application/vnd.ms-excel', ext: '.csv' }, // some browsers report CSV this way
  { mime: 'application/zip', ext: '.zip' },
  { mime: 'application/x-zip-compressed', ext: '.zip' }, // Windows-generated zips often use this
];
const CONFIGURED_MIME_TYPES = env.ALLOWED_ATTACHMENT_MIME_TYPES
  ? new Set(env.ALLOWED_ATTACHMENT_MIME_TYPES.split(',').map((type) => type.trim()).filter(Boolean))
  : null;

// Explicit denylist as a second line of defense — even if something above
// were misconfigured, these extensions are always rejected outright.
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.ps1', '.sh', '.msi', '.dll', '.js', '.jar', '.app'];

const storage = {
  _handleFile: (req, file, cb) => {
    // Random filename on disk — the original filename is preserved only in
    // the DB record, never used to build a path (blocks path traversal via
    // a crafted filename like "../../etc/passwd").
    const randomName = crypto.randomUUID();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${randomName}${ext}`;
    store.saveStream(filename, file.stream).then(
      (size) => cb(null, { destination: UPLOAD_ROOT, filename, path: store.resolve(filename), size }),
      (error) => cb(error),
    );
  },
  _removeFile: (req, file, cb) => {
    // Multer invokes this only for this request's unpublished exclusive file.
    Promise.resolve().then(() => store.remove(store.uploadedName(file.path))).then(() => cb(null), () => cb(new AppError('Upload storage cleanup is incomplete; operator recovery is required', 503)));
  },
};

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return cb(new AppError('This file type isn\'t supported.', 422));
  }

  const isAllowed = ALLOWED_TYPES.some((t) => t.mime === file.mimetype && t.ext === ext);
  if (!isAllowed || (CONFIGURED_MIME_TYPES && !CONFIGURED_MIME_TYPES.has(file.mimetype))) {
    return cb(new AppError('This file type isn\'t supported.', 422));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

// Wraps multer's single-file middleware so its errors (file too large,
// rejected type) come back through our normal AppError -> errorHandler
// pipeline instead of multer's own default error shape.
function uploadSingleFile(fieldName) {
  const handler = upload.single(fieldName);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();
      if (err.storageErrors?.length) return next(new AppError('Upload storage cleanup is incomplete; operator recovery is required', 503));
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(`File is too large. Maximum file size is ${env.MAX_ATTACHMENT_SIZE_MB} MB.`, 413));
      }
      return next(err instanceof AppError ? err : new AppError('Upload could not be completed', 503));
    });
  };
}

module.exports = {
  uploadSingleFile,
  UPLOAD_ROOT,
  resolveUploadPath: store.resolve,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_TYPES,
};
