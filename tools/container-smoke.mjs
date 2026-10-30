/** Exercise a built final image using only disposable containers and a private database. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const image = process.argv[2];
assert.ok(image && /^[a-zA-Z0-9][a-zA-Z0-9./:@_-]*$/.test(image),
  'Usage: node tools/container-smoke.mjs <built-image>');
const expectedNode = (await readFile(new URL('../.node-version', import.meta.url), 'utf8')).trim();
assert.match(expectedNode, /^24\.\d+\.\d+$/);
const postgres = 'postgres:17.7-bookworm@sha256:86e0b703649d7a792bd9243ee28afc9d8f7c6b2b5638077c9d6882d4d472bbfd';
const suffix = randomBytes(6).toString('hex');
const network = `openscroll-image-test-${suffix}`;
const database = `${network}-db`, migration = `${network}-migrate`, app = `${network}-app`;
const directory = await mkdtemp(join(tmpdir(), 'openscroll-image-test-'));
const password = randomBytes(24).toString('hex');
const databaseUrl = `postgresql://openscroll:${password}@db:5432/openscroll`;
// Select only the managed local daemon. Preserve proxy and Docker credential configuration.
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
function command(file, args, { input, timeout = 120000, env = process.env } = {}) {
  return new Promise((accept, reject) => {
    const child = execFile(file, args, { env, timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${file} ${args[0]} failed: ${(stderr || error.message).replaceAll(password, '[test-password]').slice(-2400)}`));
      else accept(stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const docker = (args, options = {}) => command('docker', ['--host=unix:///var/run/docker.sock', ...args], { ...options, env: dockerEnv });
const pause = () => new Promise(resolve => setTimeout(resolve, 500));
let verified = false;
try {
  assert.equal((await docker(['image', 'inspect', '--format', '{{.Config.User}}', image])).trim(), 'node',
    'The final image must retain its unprivileged node user.');
  await docker(['network', 'create', '--internal', network]);
  await docker(['run', '--detach', '--name', database, '--network', network, '--network-alias', 'db',
    '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=512m',
    '--env', 'POSTGRES_USER=openscroll', '--env', 'POSTGRES_DB=openscroll', '--env', `POSTGRES_PASSWORD=${password}`, postgres], { timeout: 240000 });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { await docker(['exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'openscroll', '-d', 'openscroll']); ready = true; break; }
    catch { await pause(); }
  }
  assert.ok(ready, 'The isolated test database did not become ready.');
  await docker(['run', '--rm', '--name', migration, '--network', network, '--env', `DATABASE_URL=${databaseUrl}`,
    image, 'node', 'dist/server/src/server/migrate.js']);
  const created=JSON.parse(await docker(['run','--rm','--interactive','--name',migration,'--network',network,'--env',`DATABASE_URL=${databaseUrl}`,
    image,'node','dist/server/src/server/admin.js','create-author','smoke-owner@example.invalid','Container fixture owner'],{input:password+'\n'}));
  await docker(['run','--rm','--name',migration,'--network',network,'--env',`DATABASE_URL=${databaseUrl}`,
    image,'node','dist/server/src/server/admin.js','bootstrap-owner',created.author,'smoke-owner@example.invalid']);
  await docker(['run', '--detach', '--init', '--name', app, '--network', network,
    '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '--tmpfs', '/tmp:rw,nosuid,size=256m,mode=1777', '--shm-size=256m', '--memory=2g', '--pids-limit=256',
    '--env', `DATABASE_URL=${databaseUrl}`, '--env', 'APP_ORIGIN=http://127.0.0.1:3000',
    '--env', 'ALLOW_INSECURE_LOCAL_HTTP=true', '--env', 'MAIL_MODE=outbox', '--env', 'MAIL_OUTBOX_DIR=/tmp/local-mail',
    '--env', 'REQUIRE_EMAIL_VERIFICATION=true', '--env', 'REGISTRATION_ENABLED=false', image]);
  console.log('Final image started with a fresh isolated database; no host ports or live configuration.');
  const evidence = await docker(['exec', '--interactive', app, 'node', '--input-type=module', '-'], { input: `
    import assert from 'node:assert/strict';
    import {execFileSync} from 'node:child_process';
    import {lstatSync,readdirSync} from 'node:fs';
    import {writeFile} from 'node:fs/promises';
    import {sampleProject} from '/app/dist/server/src/project/sample.js';
    assert.equal(process.getuid(), 1000);
    assert.equal(process.versions.node, ${JSON.stringify(expectedNode)});
    for (const path of [
      ...['npm','npx','corepack','yarn','yarnpkg'].map(name=>'/usr/local/bin/'+name),
      '/usr/local/lib/node_modules/npm','/usr/local/lib/node_modules/corepack'
    ]) assert.throws(()=>lstatSync(path),{code:'ENOENT'},'Runtime package-manager files must be absent: '+path);
    assert.ok(!readdirSync('/opt').some(name=>name.startsWith('yarn-v')),'Runtime Yarn installation must be absent.');
    const versions = {};
    for (const [name, minimum] of [['perl-base','5.36.0-7+deb12u4'],['libpcre2-8-0','10.42-1+deb12u1']]) {
      const version = execFileSync('dpkg-query',['-W','-f=\u0024{Version}',name],{encoding:'utf8'}).trim();
      execFileSync('dpkg',['--compare-versions',version,'ge',minimum]); versions[name] = version;
    }
    const families = ['Noto Sans','Noto Serif','Noto Sans CJK SC'].map(family => {
      const matched = execFileSync('fc-match',['-f','%{family}',family],{encoding:'utf8'}).trim();
      assert.ok(matched.includes(family), family + ' is missing: ' + matched); return matched;
    });
    let healthy = false;
    for (let attempt=0; attempt<120; attempt++) {
      try { const response = await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(2000)});
        if (response.ok) { assert.deepEqual(await response.json(),{status:'ready',database:'connected'}); healthy=true; break; }
      } catch {}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert.ok(healthy,'Final-image application health check timed out.');
    const home = await fetch('http://127.0.0.1:3000/');
    assert.equal(home.status,200); assert.ok(home.headers.get('content-type')?.includes('text/html'));
    assert.match(await home.text(),/OpenScroll/);
    assert.equal((await fetch('http://127.0.0.1:3000/api/projects/sample')).status,401);
    const origin='http://127.0.0.1:3000';
    const login=await fetch(origin+'/api/account/login',{method:'POST',headers:{'content-type':'application/json','x-openscroll-request':'1',origin},
      body:JSON.stringify({email:'smoke-owner@example.invalid',password:${JSON.stringify(password)}})});
    assert.equal(login.status,200,'The explicitly bootstrapped fixture owner must sign in.');
    const session=await login.json();assert.equal(session.author.role,'owner');assert.equal(session.author.approvalStatus,'approved');
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const headers={'content-type':'application/json','x-openscroll-request':'1',origin,cookie,'x-csrf-token':session.csrf};
    assert.equal((await fetch(origin+'/app/',{headers:{cookie}})).status,200);
    const project=sampleProject();
    project.document.course.sections[0].lessons[0].blocks.find(block=>block.type==='paragraph').content.text='CONTAINER-PDF-LATIN Café 中文学习';
    const response=await fetch('http://127.0.0.1:3000/api/projects/pdf',{
      method:'POST',headers,
      body:JSON.stringify({project,options:{paper:'A4',includeAnswers:false}}),signal:AbortSignal.timeout(60000)
    });
    if (!response.ok) {
      const message=await response.text();
      // The public API intentionally hides browser launch details; diagnose this disposable fixture only.
      const {chromium}=await import('/app/node_modules/playwright-core/index.mjs');
      const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,timeout:15000,args:['--disable-dev-shm-usage']});
      await browser.close();
      assert.fail('Actual PDF export: '+response.status+' '+message);
    }
    assert.ok(response.headers.get('content-type')?.includes('application/pdf'));
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-'); assert.ok(bytes.length>1000);
    await writeFile('/tmp/openscroll-container-smoke.pdf',bytes);
    console.log(JSON.stringify({node:process.versions.node,runtimePackageManagers:'absent',accessGate:'anonymous denied; explicit owner approved',chromium:execFileSync('/usr/bin/chromium',['--version'],{encoding:'utf8'}).trim(),versions,families,pdfBytes:bytes.length}));
  ` });
  const pdf = join(directory, 'container.pdf');
  // Read through exec because Docker's archive/cp API may not expose tmpfs files.
  const encodedPdf = await docker(['exec', app, 'node', '-e',
    "process.stdout.write(require('fs').readFileSync('/tmp/openscroll-container-smoke.pdf').toString('base64'))"]);
  await writeFile(pdf, Buffer.from(encodedPdf, 'base64'));
  const text = await command('pdftotext', ['-layout', pdf, '-']);
  assert.ok(text.includes('CONTAINER-PDF-LATIN Café'), 'Latin PDF text did not survive rendering.');
  for (const character of '中文学习') assert.ok(text.includes(character), `CJK glyph missing from PDF: ${character}`);
  const fonts = await command('pdffonts', [pdf]);
  assert.match(fonts, /NotoSans/);
  assert.match(fonts, /NotoSansCJK/);
  const fontRows = fonts.trim().split('\n').slice(2);
  assert.ok(fontRows.length > 0 && fontRows.every(row => /\syes\s+(?:yes|no)\s+(?:yes|no)\s+\d+\s+\d+\s*$/.test(row)),
    'The final PDF must embed all fonts.');
  console.log(evidence.trim());
  console.log('PASS: final-image runtime/packages, migration, health, static assets, Chromium PDF, embedded Latin/CJK fonts.');
  verified = true;
} finally {
  const cleanupErrors = [];
  for (const name of [app, migration, database]) {
    await docker(['rm', '--force', name]).catch(error => {
      if (!error.message.includes('No such container')) cleanupErrors.push(error);
    });
  }
  await docker(['network', 'rm', network]).catch(error => {
    if (!/No such network|not found/.test(error.message)) cleanupErrors.push(error);
  });
  await rm(directory, { recursive: true, force: true });
  for (const error of cleanupErrors) console.error('Test resource cleanup failed:', error.message);
  if (verified && cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Disposable test resource cleanup failed.');
}
