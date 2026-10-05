const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');
const requestContext = require('./middleware/requestContext');
const requestLogger = require('./middleware/requestLogger');
const createRateLimit = require('./middleware/rateLimit');

const app = express();
const readiness = require('./config/readiness').createReadiness(require('./config/prisma'));
app.locals.readiness = readiness;

app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'none'"],
  } },
  frameguard: { action: 'deny' }, referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: env.NODE_ENV === 'production' ? { maxAge: 31536000 } : false,
}));
app.use((req, res, next) => {
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(cors({ origin: (origin, callback) => !origin || env.CORS_ORIGINS.includes(origin) ? callback(null, true) : callback(new AppError('Origin is not allowed by CORS policy', 403)), credentials: true }));
app.use(express.json());
app.use(requestContext);
app.use(requestLogger);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', async (req, res) => {
  const ready = await readiness.check();
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
});

app.use('/api', createRateLimit({ windowMs: env.API_RATE_LIMIT_WINDOW_MS, max: env.API_RATE_LIMIT_MAX }), (req, res, next) => {
  if (env.NODE_ENV !== 'production') return next();
  readiness.check().then((ready) => ready ? next() : next(new AppError('Service is temporarily unavailable', 503))).catch(next);
}, routes);

app.use((req, res, next) => {
  next(new AppError('Route not found', 404));
});

app.use(errorHandler);

module.exports = app;
