import pg from 'pg';
import { readConfig } from './config.js';
import { migrate } from './migrations.js';
const pool=new pg.Pool({connectionString:readConfig().databaseUrl,connectionTimeoutMillis:3000});
try { await migrate(pool); console.log('OpenScroll database migrations are current.'); }
catch { console.error('Migration failed. Check database connectivity and schema compatibility.'); process.exitCode=1; }
finally { await pool.end(); }
