/**
 * Express app factory for supertest
 *
 * Creates a minimal Express app with JSON middleware and mounts routes
 * without starting a real server or connecting to any external dependencies.
 */

import express from 'express';

export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  return app;
}
