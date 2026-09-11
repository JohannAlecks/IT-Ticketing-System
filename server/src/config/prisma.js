const { PrismaClient } = require('@prisma/client');
const env = require('./env');

const prisma = new PrismaClient({
  log: process.env.SLA_SWEEP_QUIET === '1' ? [] : (env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']).map((level) => ({ level, emit: 'event' })),
});
// Prisma messages can embed query arguments and personal content. Keep only
// an operational signal; never log the raw event or SQL parameter values.
prisma.$on('error', () => console.error('Database operation failed (details redacted)'));
prisma.$on('warn', () => console.warn('Database warning (details redacted)'));

module.exports = prisma;
