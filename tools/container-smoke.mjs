/** Exercise paired app/renderer images with disposable resources and synthetic configuration only. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [appImage, rendererImage] = process.argv.slice(2);
assert.ok(process.argv.length === 4 && [appImage, rendererImage].every(value =>
  value && /^[a-zA-Z0-9][a-zA-Z0-9./:@_-]*$/.test(value)),
  'Usage: node tools/container-smoke.mjs <app-image> <renderer-image>');
const expectedNode = (await readFile(new URL('../.node-version', import.meta.url), 'utf8')).trim();
assert.match(expectedNode, /^24\.\d+\.\d+$/);
const postgres = 'postgres:17.11-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5';
const suffix = randomBytes(6).toString('hex');
const network = `openscroll-image-test-${suffix}`;
const database = `${network}-db`, migration = `${network}-migrate`, app = `${network}-app`, renderer = `${network}-renderer`;
const socketVolume = `${network}-socket`, socketDirectory = '/run/openscroll-renderer';
const socketPath = `${socketDirectory}/renderer.sock`;
const hbaFile=fileURLToPath(new URL('../deploy/pg_hba.conf',import.meta.url));
const hbaTarget='/etc/postgresql/openscroll-pg-hba.conf';
const directory = await mkdtemp(join(tmpdir(), 'openscroll-image-test-'));
const password = randomBytes(24).toString('hex');
const runtimePassword = randomBytes(32).toString('hex');
const migratorPassword = randomBytes(32).toString('hex');
const smtpCanary = `synthetic-smtp-${randomBytes(16).toString('hex')}`;
const sessionCanary = `synthetic-session-${randomBytes(16).toString('hex')}`;
const provisionUrl = `postgresql://openscroll:${password}@db:5432/openscroll`;
const adminUrl = `postgresql://openscroll_migrator:${migratorPassword}@db:5432/openscroll`;
const databaseUrl = `postgresql://openscroll_app:${runtimePassword}@db:5432/openscroll`;
const secrets = [password, runtimePassword, migratorPassword, smtpCanary, sessionCanary];
const sanitize = text => secrets.reduce((value, secret) => value.replaceAll(secret, '[synthetic-configuration]'), text);
const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'];
const noProxies = proxyKeys.flatMap(key => ['--env', `${key}=`]);
// Preserve CLI proxy/registry settings while explicitly selecting the managed local daemon.
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
function command(file, args, { input, timeout = 120000, env = process.env, mergeOutput = false } = {}) {
  return new Promise((accept, reject) => {
    const child = execFile(file, args, { env, timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${file} ${args[0]} failed: ${sanitize(stderr || error.message).slice(-2400)}`));
      else accept(mergeOutput ? stdout + stderr : stdout);
    });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
const docker = (args, options = {}) => command('docker', ['--host=unix:///var/run/docker.sock', ...args], { ...options, env: dockerEnv });
const inspect = async (kind, name) => JSON.parse(await docker([kind, 'inspect', name]))[0];
const pause = () => new Promise(resolve => setTimeout(resolve, 500));
const packageManagerChecks = `
  for (const path of [
    ...['npm','npx','corepack','yarn','yarnpkg'].map(name=>'/usr/local/bin/'+name),
    '/usr/local/lib/node_modules/npm','/usr/local/lib/node_modules/corepack'
  ]) assert.throws(()=>lstatSync(path),{code:'ENOENT'},'Runtime package manager must be absent: '+path);
  assert.ok(!readdirSync('/opt').some(name=>name.startsWith('yarn-v')),'Runtime Yarn must be absent.');
`;
let verified = false;
try {
  const [appDefinition, rendererDefinition] = await Promise.all([inspect('image', appImage), inspect('image', rendererImage)]);
  assert.equal(appDefinition.Config.User, 'node', 'The app image must retain its unprivileged node user.');
  assert.equal(rendererDefinition.Config.User, '0:1000', 'Only the renderer supervisor uses UID0 with the app client group.');
  assert.deepEqual(rendererDefinition.Config.Cmd, ['node', 'dist/server/src/renderer/server.js']);
  const sensitiveKey = /^(?:DATABASE_URL|ADMIN_DATABASE_URL|PROVISION_DATABASE_URL|MIGRATOR_DB_PASSWORD|RUNTIME_DB_PASSWORD|PGPASSWORD|PGPASSFILE|PGSERVICE|PGSERVICEFILE|PGUSER|POSTGRES_|SMTP_|MAIL_|SESSION_|APP_|ACCESS_REQUEST_NOTIFY_EMAIL)/;
  assert.ok(!rendererDefinition.Config.Env.some(value => sensitiveKey.test(value.split('=')[0])),
    'The renderer image must contain no application credential configuration.');
  await docker(['network', 'create', '--internal', network]);
  await docker(['volume', 'create', socketVolume]);
  await docker(['run', '--detach', '--name', database, '--network', network, '--network-alias', 'db',
    '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=512m',
    '--mount',`type=bind,src=${hbaFile},dst=${hbaTarget},readonly`,
    '--env', 'POSTGRES_USER=openscroll', '--env', 'POSTGRES_DB=openscroll', '--env', `POSTGRES_PASSWORD=${password}`,
    ...noProxies, postgres,'postgres','-c',`hba_file=${hbaTarget}`], { timeout: 240000 });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { await docker(['exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'openscroll', '-d', 'openscroll']); ready = true; break; }
    catch { await pause(); }
  }
  assert.ok(ready, 'The isolated test database did not become ready.');
  const databasePolicy=JSON.parse(await docker(['exec',database,'psql','-X','-U','openscroll','-d','openscroll','-At','-c',
    "SELECT json_build_object('version',current_setting('server_version'),'versionNum',current_setting('server_version_num')::int,'hbaFile',current_setting('hba_file'),'hbaErrors',(SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL))"]));
  assert.equal(databasePolicy.versionNum,170011);assert.equal(databasePolicy.hbaFile,hbaTarget);
  assert.equal(databasePolicy.hbaErrors,0,'The mounted production host-authentication policy must parse without errors.');
  const isolatedOperator = ['run', '--rm', '--name', migration, '--network', network,
    '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '--tmpfs', '/tmp:rw,nosuid,noexec,size=64m,mode=1777'];
  await docker([...isolatedOperator.slice(0,2),'--interactive',...isolatedOperator.slice(2),
    '--env',`PROVISION_DATABASE_URL=${provisionUrl}`,...noProxies,appImage,'node','dist/server/src/server/provision.js'],
    {input:JSON.stringify({runtimePassword,migratorPassword})});
  const operator = [...isolatedOperator, '--env', `ADMIN_DATABASE_URL=${adminUrl}`, ...noProxies];
  await docker([...operator, appImage, 'node', 'dist/server/src/server/migrate.js']);
  await docker([...operator.slice(0,2),'--interactive',...operator.slice(2),appImage,'node','--input-type=module','-'],{input:`
    import assert from 'node:assert/strict';import pg from 'pg';
    const current=new pg.Pool({connectionString:process.env.ADMIN_DATABASE_URL});
    try{assert.equal((await current.query('SELECT current_user AS name')).rows[0].name,'openscroll_migrator');}finally{await current.end();}
    for(const database of ['postgres','template1']){
      const url=new URL(process.env.ADMIN_DATABASE_URL);url.pathname='/'+database;
      const pool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:3000});
      try{await assert.rejects(pool.query('SELECT 1'),{code:'28000'});}finally{await pool.end();}
    }
  `});
  const created = JSON.parse(await docker([...operator.slice(0, 2), '--interactive', ...operator.slice(2), appImage,
    'node', 'dist/server/src/server/admin.js', 'create-author', 'smoke-owner@example.invalid', 'Container fixture owner'], { input: password + '\n' }));
  await docker([...operator, appImage, 'node', 'dist/server/src/server/admin.js', 'bootstrap-owner', created.author, 'smoke-owner@example.invalid']);
  await docker(['run', '--detach', '--init', '--name', renderer, '--network=none', '--ipc=private', '--user=0:1000',
    '--read-only', '--cap-drop=ALL', '--cap-add=SETUID', '--cap-add=SETGID', '--cap-add=KILL',
    '--security-opt=no-new-privileges:true', '--tmpfs', '/tmp:rw,nosuid,noexec,size=256m,mode=1777',
    '--shm-size=256m', '--memory=1g', '--memory-swap=1g', '--cpus=1', '--pids-limit=256',
    '--mount', `type=volume,src=${socketVolume},dst=${socketDirectory}`,
    '--env', `PDF_RENDERER_SOCKET=${socketPath}`, ...noProxies, rendererImage]);
  let socketReady = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await docker(['exec', renderer, 'node', '-e', `const s=require('fs').lstatSync(${JSON.stringify(socketPath)});if(!s.isSocket()||s.uid!==0||s.gid!==1000||(s.mode&0o777)!==0o660)process.exit(1)`]);
      socketReady = true; break;
    } catch { await pause(); }
  }
  assert.ok(socketReady, 'The isolated renderer did not expose its restricted Unix socket.');
  const worker = await inspect('container', renderer);
  assert.equal(worker.HostConfig.NetworkMode, 'none');
  assert.equal(worker.HostConfig.IpcMode, 'private');
  assert.equal(worker.HostConfig.Privileged, false); assert.equal(worker.HostConfig.ReadonlyRootfs, true);
  assert.equal(worker.HostConfig.Init, true);
  assert.deepEqual(worker.HostConfig.CapDrop.map(value => value.replace(/^CAP_/, '')).sort(), ['ALL']);
  assert.deepEqual(worker.HostConfig.CapAdd.map(value => value.replace(/^CAP_/, '')).sort(), ['KILL', 'SETGID', 'SETUID']);
  assert.ok(worker.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
  assert.equal(worker.HostConfig.Memory, 1024 ** 3); assert.equal(worker.HostConfig.MemorySwap, 1024 ** 3);
  assert.equal(worker.HostConfig.NanoCpus, 1e9);
  assert.equal(worker.HostConfig.PidsLimit, 256); assert.equal(worker.HostConfig.ShmSize, 256 * 1024 ** 2);
  assert.ok(worker.HostConfig.Tmpfs['/tmp'].split(',').includes('noexec'));
  assert.ok(worker.HostConfig.Tmpfs['/tmp'].split(',').includes('nosuid'));
  assert.equal(Object.keys(worker.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal((worker.HostConfig.Devices ?? []).length, 0);
  const workerMounts = worker.Mounts.filter(mount => mount.Type !== 'tmpfs');
  assert.equal(workerMounts.length, 1, 'The renderer may mount only its named socket volume.');
  assert.equal(workerMounts[0].Type, 'volume'); assert.equal(workerMounts[0].Name, socketVolume);
  assert.equal(workerMounts[0].Destination, socketDirectory); assert.equal(workerMounts[0].RW, true);
  const workerEnv = Object.fromEntries(worker.Config.Env.map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
  for (const key of proxyKeys) assert.ok(workerEnv[key] === '', `${key} must be explicitly empty in the renderer.`);
  assert.ok(!Object.keys(workerEnv).some(key => sensitiveKey.test(key)), 'Application credential keys must not reach the renderer.');
  assert.ok(!secrets.some(secret => worker.Config.Env.some(value => value.includes(secret))), 'Application configuration canaries must not reach the renderer.');
  const rendererEvidence = await docker(['exec', '--interactive', renderer, 'node', '--input-type=module', '-'], { input: `
    import assert from 'node:assert/strict';
    import {execFileSync} from 'node:child_process';
    import {lstatSync,readdirSync,readFileSync} from 'node:fs';
    assert.equal(process.getuid(),0);assert.equal(process.getgid(),1000);
    assert.equal(process.versions.node,${JSON.stringify(expectedNode)});
    ${packageManagerChecks}
    for(const path of ['/app/dist/server/src/server','/app/dist/server/src/project/sample.js','/app/dist/server/src/project/pdf-html.js',
      '/app/dist/client','/app/.env','/app/node_modules/pg','/app/node_modules/nodemailer','/var/run/docker.sock'])
      assert.throws(()=>lstatSync(path),{code:'ENOENT'},'App code/configuration must be absent from the renderer: '+path);
    const status=readFileSync('/proc/1/status','utf8');
    const field=name=>status.match(new RegExp('^'+name+':(.*)$','m'))[1].trim();
    assert.equal(BigInt('0x'+field('CapEff')),224n);
    assert.equal(field('NoNewPrivs'),'1');assert.equal(field('Seccomp'),'2');
    const versions={};
    for(const[name,minimum]of[['perl-base','5.36.0-7+deb12u4'],['libpcre2-8-0','10.42-1+deb12u1']]){
      const version=execFileSync('dpkg-query',['-W','-f=\u0024{Version}',name],{encoding:'utf8'}).trim();
      execFileSync('dpkg',['--compare-versions',version,'ge',minimum]);versions[name]=version;
    }
    const families=['Noto Sans','Noto Serif','Noto Sans CJK SC'].map(family=>{
      const matched=execFileSync('fc-match',['-f','%{family}',family],{encoding:'utf8'}).trim();
      assert.ok(matched.includes(family),'A required renderer font is missing.');return matched;
    });
    console.log(JSON.stringify({node:process.versions.node,supervisorUid:process.getuid(),supervisorGid:process.getgid(),
      chromium:execFileSync('/usr/bin/chromium',['--version'],{encoding:'utf8'}).trim(),versions,families,
      boundary:'network none; restricted socket only; no application code or credential configuration'}));
  ` });
  await docker(['run', '--detach', '--init', '--name', app, '--network', network,
    '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '--tmpfs', '/tmp:rw,nosuid,size=256m,mode=1777', '--memory=2g', '--pids-limit=256',
    '--mount', `type=volume,src=${socketVolume},dst=${socketDirectory},readonly`,
    '--env', `PDF_RENDERER_SOCKET=${socketPath}`, '--env', `DATABASE_URL=${databaseUrl}`,
    '--env', 'APP_ORIGIN=http://127.0.0.1:3000', '--env', 'ALLOW_INSECURE_LOCAL_HTTP=true',
    '--env', 'MAIL_MODE=outbox', '--env', 'MAIL_OUTBOX_DIR=/tmp/local-mail',
    '--env', 'SMTP_HOST=smtp.example.invalid', '--env', 'SMTP_USER=synthetic-mail-user', '--env', `SMTP_PASSWORD=${smtpCanary}`,
    '--env', `SESSION_SECRET=${sessionCanary}`, '--env', 'REQUIRE_EMAIL_VERIFICATION=true', '--env', 'REGISTRATION_ENABLED=false',
    ...noProxies, appImage]);
  const appContainer = await inspect('container', app);
  assert.ok(!appContainer.Config.Env.some(value=>/^(?:ADMIN_DATABASE_URL|PROVISION_DATABASE_URL|MIGRATOR_DB_PASSWORD|RUNTIME_DB_PASSWORD|POSTGRES_PASSWORD|PGPASSWORD|PGPASSFILE|PGSERVICE|PGSERVICEFILE|PGUSER)=/.test(value)),
    'Only the runtime database connection may enter the app container.');
  assert.ok(![password,migratorPassword].some(secret=>appContainer.Config.Env.some(value=>value.includes(secret))),
    'Bootstrap and migrator passwords must stay outside the app container.');
  const appSocket = appContainer.Mounts.find(mount => mount.Name === socketVolume);
  assert.ok(appSocket && appSocket.Destination === socketDirectory && !appSocket.RW, 'The app must mount the socket volume read-only.');
  assert.ok([smtpCanary, sessionCanary].every(secret => appContainer.Config.Env.some(value => value.includes(secret))),
    'Synthetic configuration canaries must exist only in the app fixture.');
  console.log('Paired images started with a fresh private database and restricted socket; no host ports or live configuration.');
  const evidence = await docker(['exec', '--interactive', app, 'node', '--input-type=module', '-'], { timeout: 180000, input: `
    import assert from 'node:assert/strict';
    import {lstatSync,readdirSync} from 'node:fs';
    import {writeFile} from 'node:fs/promises';
    import {sampleProject} from '/app/dist/server/src/project/sample.js';
    import pg from '/app/node_modules/pg/lib/index.js';
    import {assertRuntimeDatabaseRole} from '/app/dist/server/src/server/database-access.js';
    assert.equal(process.getuid(),1000);assert.equal(process.versions.node,${JSON.stringify(expectedNode)});
    ${packageManagerChecks}
    const runtimePool=new pg.Pool({connectionString:process.env.DATABASE_URL});
    try{
      await assertRuntimeDatabaseRole(runtimePool);
      assert.equal((await runtimePool.query('SELECT current_user AS name')).rows[0].name,'openscroll_app');
      const wrongUrl=new URL(process.env.DATABASE_URL);wrongUrl.password='wrong-synthetic-password-for-scram';
      const wrongPool=new pg.Pool({connectionString:wrongUrl.href,connectionTimeoutMillis:3000});
      try{await assert.rejects(wrongPool.query('SELECT 1'),{code:'28P01'});}finally{await wrongPool.end();}
      for(const database of ['postgres','template1']){
        const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;
        const deniedPool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:3000});
        try{await assert.rejects(deniedPool.query('SELECT 1'),{code:'28000'});}finally{await deniedPool.end();}
      }
      for(const sql of ['CREATE TABLE public.container_denied(id int)','CREATE TEMP TABLE container_denied(id int)',
        "UPDATE admin_events SET operation='changed' WHERE false",'DELETE FROM schema_migrations WHERE false',
        "SELECT pg_read_file('/dev/null',0,0)"])
        await assert.rejects(runtimePool.query(sql),{code:'42501'});
    }finally{await runtimePool.end();}
    for(const path of ['/usr/bin/chromium','/usr/lib/chromium','/usr/bin/fc-match'])
      assert.throws(()=>lstatSync(path),{code:'ENOENT'},'The app must not contain native browser/font tooling.');
    for(const path of ['/var/run/postgresql/.s.PGSQL.5432','/tmp/.s.PGSQL.5432'])
      assert.throws(()=>lstatSync(path),{code:'ENOENT'},'The protected database Unix socket must not be shared with the app.');
    for(const path of ['/usr/share/fonts','/usr/local/share/fonts']){
      let files=[];try{files=readdirSync(path,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
      assert.ok(!files.some(file=>/\\.(?:ttf|otf|ttc)$/i.test(file)),'Native rendering fonts must not exist in the app.');
    }
    const origin='http://127.0.0.1:3000';let healthy=false;
    for(let attempt=0;attempt<120;attempt++){
      try{const response=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)});
        if(response.ok){assert.deepEqual(await response.json(),{status:'ready',database:'connected'});healthy=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert.ok(healthy,'Final app health check timed out.');
    const home=await fetch(origin+'/');assert.equal(home.status,200);assert.match(await home.text(),/OpenScroll/);
    assert.equal((await fetch(origin+'/api/projects/sample')).status,401);
    const anonymousPdf=await fetch(origin+'/api/projects/pdf',{method:'POST',headers:{'content-type':'application/json','x-openscroll-request':'1',origin},body:'{'});
    assert.equal(anonymousPdf.status,401,'Anonymous PDF requests must be denied before malformed JSON parsing.');
    const login=await fetch(origin+'/api/account/login',{method:'POST',headers:{'content-type':'application/json','x-openscroll-request':'1',origin},
      body:JSON.stringify({email:'smoke-owner@example.invalid',password:${JSON.stringify(password)}})});
    assert.equal(login.status,200,'The explicitly bootstrapped fixture owner must sign in.');
    const session=await login.json();assert.equal(session.author.role,'owner');assert.equal(session.author.approvalStatus,'approved');
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const headers={'content-type':'application/json','x-openscroll-request':'1',origin,cookie,'x-csrf-token':session.csrf};
    assert.equal((await fetch(origin+'/app/',{headers:{cookie}})).status,200);
    const project=sampleProject();
    project.document.course.sections[0].lessons[0].blocks.find(block=>block.type==='paragraph').content.text='CONTAINER-PDF-LATIN Café 中文学习';
    const response=await fetch(origin+'/api/projects/pdf',{method:'POST',headers,
      body:JSON.stringify({project,options:{paper:'A4',includeAnswers:false}}),signal:AbortSignal.timeout(60000)});
    assert.equal(response.status,200,'The actual API PDF request must succeed through the separate renderer.');
    assert.ok(response.headers.get('content-type')?.includes('application/pdf'));
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>1000);
    await writeFile('/tmp/openscroll-container-smoke.pdf',bytes);
    console.log(JSON.stringify({node:process.versions.node,appUid:process.getuid(),nativeBrowserAndFonts:'absent',
      runtimePackageManagers:'absent',accessGate:'anonymous PDF denied before parsing; explicit owner approved',pdfBytes:bytes.length}));
  ` });
  const pdf = join(directory, 'container.pdf');
  const encodedPdf = await docker(['exec', app, 'node', '-e',
    "process.stdout.write(require('fs').readFileSync('/tmp/openscroll-container-smoke.pdf').toString('base64'))"]);
  await writeFile(pdf, Buffer.from(encodedPdf, 'base64'));
  const text = await command('pdftotext', ['-layout', pdf, '-']);
  assert.ok(text.includes('CONTAINER-PDF-LATIN Café'), 'Latin PDF text did not survive rendering.');
  for (const character of '中文学习') assert.ok(text.includes(character), `CJK glyph missing from PDF: ${character}`);
  const fonts = await command('pdffonts', [pdf]);
  assert.match(fonts, /NotoSans/);assert.match(fonts, /NotoSansCJK/);
  const fontRows = fonts.trim().split('\n').slice(2);
  assert.ok(fontRows.length > 0 && fontRows.every(row => /\syes\s+(?:yes|no)\s+(?:yes|no)\s+\d+\s+\d+\s*$/.test(row)),
    'The final PDF must embed all fonts.');
  const workerLogs = await docker(['logs', renderer], { mergeOutput: true });
  assert.ok(!secrets.some(secret => workerLogs.includes(secret)), 'Renderer logs must not contain app configuration canaries.');
  console.log(JSON.stringify({postgres:databasePolicy.version,hbaErrors:databasePolicy.hbaErrors,runtimeAndMigratorMaintenanceDatabaseAccess:'rejected with SQLSTATE 28000',runtimePasswordAuthentication:'wrong password rejected with SQLSTATE 28P01'}));
  console.log(rendererEvidence.trim());console.log(evidence.trim());
  console.log('PASS: app/renderer separation, restricted socket, isolated database roles and host authentication, approval gate, actual API PDF, embedded Latin/CJK fonts.');
  verified = true;
} catch (error) {
  const logs = await docker(['logs', '--tail', '40', renderer], { mergeOutput: true }).catch(() => '');
  if (logs.trim()) console.error('Renderer fixture diagnostics (sanitized):\n' + sanitize(logs).slice(-2400));
  throw error;
} finally {
  const cleanupErrors = [];
  for (const name of [app, migration, renderer, database]) {
    await docker(['rm', '--force', name]).catch(error => {
      if (!error.message.includes('No such container')) cleanupErrors.push(error);
    });
  }
  await docker(['network', 'rm', network]).catch(error => {
    if (!/No such network|not found/.test(error.message)) cleanupErrors.push(error);
  });
  await docker(['volume', 'rm', socketVolume]).catch(error => {
    if (!/No such volume|not found/.test(error.message)) cleanupErrors.push(error);
  });
  await rm(directory, { recursive: true, force: true });
  for (const error of cleanupErrors) console.error('Test resource cleanup failed:', error.message);
  if (verified && cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Disposable test resource cleanup failed.');
}
