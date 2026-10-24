import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AccountConfig } from './config.js';
export interface Message { to:string; subject:string; text:string; }
export type Mailer = (message:Message) => Promise<void>;
export function createMailer(config:AccountConfig): Mailer {
  if (config.mailMode === 'outbox') return async message => {
    await mkdir(config.outbox,{recursive:true,mode:0o700});
    await writeFile(join(config.outbox,`${randomUUID()}.json`),JSON.stringify({...message,from:config.from})+'\n',{flag:'wx',mode:0o600});
  };
  const transport=nodemailer.createTransport({...config.smtp,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
  return async message => { await transport.sendMail({...message,from:config.from}); };
}
