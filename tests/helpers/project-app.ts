import Fastify from 'fastify';
import { projectRoutes } from '../../src/server/project-routes.js';

/**
 * Project-handler harness only: authentication is covered against buildApp in
 * project-access.test.ts and the database integration tests. This helper is
 * deliberately outside production wiring and provides no application bypass.
 */
export async function buildApprovedProjectApp(playerRoot?: string) {
  const app = Fastify({ logger: false });
  await app.register(projectRoutes, { prefix: '/api/projects', playerRoot });
  return app;
}
