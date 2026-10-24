import { trustedProxyHops } from './config.js';
import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { projectRoutes } from './project-routes.js';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { accountRoutes, type AccountServices } from './accounts/routes.js';
import { resolve } from 'node:path';
export interface Database { query: (text: string) => Promise<unknown>; }
export async function buildApp(database: Database, staticRoot?: string, accounts?:AccountServices) {
  const hops=trustedProxyHops();
  const app = Fastify({ logger: false, trustProxy:hops ? (_address,hop)=>hop<hops : false, requestTimeout: 30_000, connectionTimeout: 30_000 });
  if(process.env.NODE_ENV==='production')app.addHook('onResponse',async(request,reply)=>{if(request.routeOptions.url==='/api/health'&&reply.statusCode===200)return;console.log(JSON.stringify({event:'http',requestId:request.id,method:request.method,route:request.routeOptions.url??'unmatched',status:reply.statusCode,durationMs:Math.round(reply.elapsedTime)}));});
  app.addHook('onSend',async (request,reply) => {
    const player=request.url.split('?')[0]==='/player.html';
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer').header('X-Frame-Options',player ? 'SAMEORIGIN' : 'DENY');
    if(staticRoot)reply.header('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors ${player ? "'self'" : "'none'"}; form-action 'self'`);
  });
  app.get('/api/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      await database.query('SELECT 1');
      return { status: 'ready', database: 'connected' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: 'unavailable' });
    }
  });
  await app.register(cookie);
  await app.register(rateLimit,{global:false});
  if (accounts) await app.register(accountRoutes,{prefix:'/api',...accounts});
  await app.register(projectRoutes, { prefix: '/api/projects',playerRoot:staticRoot });
  if (staticRoot) await app.register(staticFiles, { root: resolve(staticRoot) });
  return app;
}
