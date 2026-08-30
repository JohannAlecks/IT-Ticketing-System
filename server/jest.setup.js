// Runs before any test file is loaded. Provides safe dummy values for the
// env vars config/env.js requires to exist — tests never touch a real
// database or sign real tokens (Prisma and jwt are mocked per-suite), this
// just satisfies the startup check so requiring the app's modules doesn't
// throw before mocks are even set up.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-for-production';
