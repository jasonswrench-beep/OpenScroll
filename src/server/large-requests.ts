/**
 * A whole course travels as one request (every file in base64), and the server holds it in memory while it reads,
 * checks and stores or converts it: at the default limits that is a few hundred MiB. So each server process handles
 * one large request at a time. The slot is taken before the body is read, so a second large upload is turned away
 * at once with "try again" (429 and Retry-After) instead of being read alongside the first. Small requests, such as
 * the routine saves that carry no files, never wait for it.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/** Bodies up to this size never need the slot. A save without new files is far smaller. */
export const LARGE_BODY_BYTES = 8 * 1024 * 1024;
export const BUSY_MESSAGE = 'The server is busy with another large course. Please try again in a moment.';

export class LargeRequestSlot {
  private holder: string | undefined;
  /** Takes the slot for this request; false when another request holds it. */
  take(id: string) { if (this.holder !== undefined && this.holder !== id) return false; this.holder = id; return true; }
  release(id: string) { if (this.holder === id) this.holder = undefined; }
  get busy() { return this.holder !== undefined; }
}

declare module 'fastify' {
  interface FastifyInstance { largeRequests: LargeRequestSlot }
  interface FastifyRequest { largeRequestWorking: boolean }
  interface FastifyContextConfig { largeBody?: boolean }
}

/** One slot per server process, shared by every route that reads a whole course. */
export function installLargeRequestSlot(app: FastifyInstance) {
  if (!app.hasDecorator('largeRequests')) app.decorate('largeRequests', new LargeRequestSlot());
  if (!app.hasRequestDecorator('largeRequestWorking')) app.decorateRequest('largeRequestWorking', false);
}

/** A body is large when it says so, or when it gives no length (a streamed upload). */
export function isLargeBody(request: FastifyRequest, threshold = LARGE_BODY_BYTES) {
  const length = request.headers['content-length'];
  if (length === undefined) return request.headers['transfer-encoding'] !== undefined;
  const bytes = Number(length);
  return !Number.isSafeInteger(bytes) || bytes > threshold;
}

/** Takes the slot or answers 429. Returns true when the request may go on. */
export function claimLargeRequest(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply, message = BUSY_MESSAGE) {
  if (app.largeRequests.take(request.id)) return true;
  void reply.code(429).header('Retry-After', '3').send({ error: message });
  return false;
}

/**
 * Guards the routes in this plugin marked `config: { largeBody: true }`. The slot is held from before the body is
 * read until the handler finishes; an upload abandoned or timed out before its handler starts gives it back at once.
 */
export function guardLargeBodies(app: FastifyInstance, threshold = LARGE_BODY_BYTES) {
  const slot = app.largeRequests;
  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.config?.largeBody && isLargeBody(request, threshold)) { if (!claimLargeRequest(app, request, reply)) return reply; }
  });
  app.addHook('onResponse', async request => { slot.release(request.id); });
  app.addHook('onRequestAbort', async request => { if (!request.largeRequestWorking) slot.release(request.id); });
  app.addHook('onTimeout', async request => { if (!request.largeRequestWorking) slot.release(request.id); });
}

/** Runs a guarded route's work and gives the slot back when the work ends, even if the client has gone. */
export async function withLargeRequest<T>(app: FastifyInstance, request: FastifyRequest, work: () => Promise<T>) {
  request.largeRequestWorking = true;
  try { return await work(); } finally { app.largeRequests.release(request.id); }
}
