// Never print a configuration value or raw error during startup/shutdown.
try {
  const env = require('./config/env');
  const app = require('./app');
  const prisma = require('./config/prisma');
  const server = app.listen(env.PORT, () => {
    console.log(`Server started [${env.NODE_ENV}]; dependency readiness is checked separately`);
  });
  const stop = require('./config/lifecycle').createShutdown({ server, prisma, readiness: app.locals.readiness });
  process.on('SIGTERM', () => stop());
  process.on('SIGINT', () => stop());
  server.on('error', () => { console.error('HTTP startup failed (details redacted)'); stop(1); });
  for (const event of ['unhandledRejection', 'uncaughtException']) process.on(event, () => {
    console.error('Unexpected runtime failure (details redacted)'); stop(1);
  });
} catch {
  console.error('Startup configuration is missing or invalid; consult the deployment checklist (details redacted)');
  process.exitCode = 1;
}
