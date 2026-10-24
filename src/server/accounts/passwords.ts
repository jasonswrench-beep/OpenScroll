import { randomBytes, scrypt as nativeScrypt, timingSafeEqual, createHash } from 'node:crypto';
let active=0;
async function derive(password:string,salt:string) {
  if (active >= 4) throw new Error('PASSWORD_BUSY');
  active++;
  try { return await new Promise<Buffer>((resolve,reject) => nativeScrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key) => error ? reject(error) : resolve(key))); }
  finally { active--; }
}
export async function hashPassword(password:string) {
  const salt=randomBytes(16).toString('hex');
  return `scrypt$32768$8$3$${salt}$${(await derive(password,salt)).toString('hex')}`;
}
export async function verifyPassword(password:string,stored:string) {
  const parts=stored.split('$');
  if (parts.length !== 6 || parts.slice(0,4).join('$') !== 'scrypt$32768$8$3' || !/^[a-f0-9]{32}$/.test(parts[4]!) || !/^[a-f0-9]{128}$/.test(parts[5]!)) return false;
  const key=await derive(password,parts[4]!);
  return timingSafeEqual(key,Buffer.from(parts[5]!,'hex'));
}
export const tokenHash=(value:string) => createHash('sha256').update(value).digest('hex');
export const randomToken=() => randomBytes(32).toString('hex');
