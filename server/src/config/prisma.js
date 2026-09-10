const { PrismaClient } = require('@prisma/client');
const env = require('./env');

const prisma = new PrismaClient({
  log: process.env.SLA_SWEEP_QUIET === '1' ? [] : (env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']),
});

module.exports = prisma;
