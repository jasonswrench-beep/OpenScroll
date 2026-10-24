import { trustedProxyHops } from '../src/server/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountConfig } from '../src/server/accounts/config.js';
import { hashPassword,verifyPassword } from '../src/server/accounts/passwords.js';
import { duplicateProject } from '../src/server/library-routes.js';
import { sampleProject } from '../src/project/sample.js';
test('production config requires HTTPS and mail settings; local overrides stay loopback-only',() => {
  assert.throws(() => accountConfig({NODE_ENV:'production'}),/APP_ORIGIN/);
  assert.throws(() => accountConfig({NODE_ENV:'production',APP_ORIGIN:'http://public.example',ALLOW_INSECURE_LOCAL_HTTP:'true'}),/HTTPS/);
  assert.throws(() => accountConfig({NODE_ENV:'production',APP_ORIGIN:'https://public.example',MAIL_MODE:'outbox'}),/SMTP/);
  assert.throws(() => accountConfig({APP_ORIGIN:'https://public.example/extra'}),/only scheme/);
  assert.throws(() => accountConfig({REGISTRATION_ENABLED:'maybe'}),/true or false/);
  const config=accountConfig({NODE_ENV:'production',APP_ORIGIN:'https://public.example',SMTP_HOST:'smtp.example',MAIL_FROM:'no-reply@example.org'});
  assert.equal(config.secureCookie,true);assert.equal(config.requireVerification,true);assert.equal(config.smtp.secure,true);
  const submission=accountConfig({MAIL_MODE:'smtp',SMTP_HOST:'smtp.example',SMTP_PORT:'587',MAIL_FROM:'no-reply@example.org'});
  assert.equal(submission.smtp.requireTLS,true);
});
test('salted password hashes verify exact passwords and reject malformed records',async () => {
  const password='Test password with spaces 42';
  const a=await hashPassword(password);const b=await hashPassword(password);
  assert.notEqual(a,b);assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('wrong',a),false);assert.equal(await verifyPassword(password,'invalid'),false);
});
test('duplication remaps all IDs and asset references without changing source',() => {
  const source=sampleProject();source.document.course.cover={assetId:'sample-image',decorative:true,altText:''};
  const before=structuredClone(source);const copy=duplicateProject(source);
  assert.deepEqual(source,before);
  assert.notEqual(copy.document.course.id,source.document.course.id);
  assert.equal(copy.document.course.cover!.assetId,copy.document.assets[0]!.id);
  assert.equal(copy.document.course.sections[0]!.lessons[0]!.blocks.find(b => b.type === 'image')!.content.assetId,copy.document.assets[0]!.id);
});

test('operator asset limits reject invalid values and default to one GiB',()=>{assert.equal(accountConfig({}).assetLimitBytes,1024*1024*1024);assert.equal(accountConfig({AUTHOR_ASSET_LIMIT_MIB:'2'}).assetLimitBytes,2*1024*1024);for(const value of ['0','-1','1.5','bad','65537'])assert.throws(()=>accountConfig({AUTHOR_ASSET_LIMIT_MIB:value}),/AUTHOR_ASSET/);});

test('proxy trust is bounded to a single explicitly enabled hop',()=>{assert.equal(trustedProxyHops({}),false);assert.equal(trustedProxyHops({TRUST_PROXY:'1'}),1);assert.throws(()=>trustedProxyHops({TRUST_PROXY:'true'}),/TRUST_PROXY/);});
