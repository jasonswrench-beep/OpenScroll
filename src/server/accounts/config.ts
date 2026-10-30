import { resolve } from 'node:path';
import { z } from 'zod';
function boolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean) {
  const value=env[key];
  if (value === undefined) return fallback;
  if (!['true','false'].includes(value)) throw new Error(`${key} must be true or false.`);
  return value === 'true';
}
export function accountConfig(env: NodeJS.ProcessEnv = process.env) {
  const production=env.NODE_ENV === 'production';
  let origin: URL;
  try { origin=new URL(env.APP_ORIGIN ?? (production ? '' : 'http://127.0.0.1:5173')); } catch { throw new Error('APP_ORIGIN must be a valid application origin.'); }
  if (!['http:','https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('APP_ORIGIN must contain only scheme, host, and optional port.');
  const local=boolean(env,'ALLOW_INSECURE_LOCAL_HTTP',false) && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  if (production && origin.protocol !== 'https:' && !local) throw new Error('Production requires an HTTPS APP_ORIGIN.');
  const mailMode=env.MAIL_MODE ?? (production && !local ? 'smtp' : 'outbox');
  if (!['smtp','outbox'].includes(mailMode)) throw new Error('MAIL_MODE must be smtp or outbox.');
  if (production && !local && mailMode !== 'smtp') throw new Error('Production requires SMTP delivery.');
  const smtpPort=Number(env.SMTP_PORT ?? 465);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT is invalid.');
  const from=env.MAIL_FROM ?? 'OpenScroll <no-reply@localhost>';
  if (/[\r\n]/.test(from)) throw new Error('MAIL_FROM is invalid.');
  if (mailMode === 'smtp' && (!env.SMTP_HOST || !env.MAIL_FROM)) throw new Error('SMTP_HOST and MAIL_FROM are required for SMTP delivery.');
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together.');
  const assetMiB=Number(env.AUTHOR_ASSET_LIMIT_MIB ?? 1024);
  if(!Number.isInteger(assetMiB)||assetMiB<1||assetMiB>65536)throw new Error('AUTHOR_ASSET_LIMIT_MIB must be an integer between 1 and 65536.');
  const requireVerification=boolean(env,'REQUIRE_EMAIL_VERIFICATION',production);
  if(production&&!requireVerification)throw new Error('Production requires email verification.');
  const notify=env.ACCESS_REQUEST_NOTIFY_EMAIL?.trim().toLowerCase()||undefined;
  if(notify!==undefined&&!z.email().max(254).safeParse(notify).success)throw new Error('ACCESS_REQUEST_NOTIFY_EMAIL must be one valid email address.');
  return {
    assetLimitBytes:assetMiB*1024*1024,
    origin:origin.origin, secureCookie:origin.protocol === 'https:', registration:boolean(env,'REGISTRATION_ENABLED',true),
    requireVerification,
    accessRequestNotifyEmail:notify,
    mailMode:mailMode as 'smtp'|'outbox', outbox:resolve(env.MAIL_OUTBOX_DIR ?? '.local/mail'), from,
    smtp:{host:env.SMTP_HOST,port:smtpPort,secure:smtpPort === 465,requireTLS:smtpPort !== 465,auth:env.SMTP_USER ? {user:env.SMTP_USER,pass:env.SMTP_PASSWORD!} : undefined},
  };
}
export type AccountConfig = ReturnType<typeof accountConfig>;
