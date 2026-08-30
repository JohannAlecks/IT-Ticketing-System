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

app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet());
app.use(cors({ origin: (origin, callback) => !origin || env.CORS_ORIGINS.includes(origin) ? callback(null, true) : callback(new AppError('Origin is not allowed by CORS policy', 403)), credentials: true }));
app.use(express.json());
app.use(requestContext);
app.use(requestLogger);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', createRateLimit({ windowMs: env.API_RATE_LIMIT_WINDOW_MS, max: env.API_RATE_LIMIT_MAX, keyGenerator: (req) => req.user?.id || req.ip }), routes);

app.use((req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

app.use(errorHandler);

module.exports = app;
