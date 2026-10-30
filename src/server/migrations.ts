import type pg from 'pg';
const migrations=[{version:1,sql:`
CREATE TABLE authors (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, display_name text NOT NULL,
 password_hash text NOT NULL, verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE author_sessions (
 token_hash text PRIMARY KEY, author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
 csrf_token text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX author_sessions_owner ON author_sessions(author_id);
CREATE TABLE account_tokens (
 token_hash text PRIMARY KEY, author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK (purpose IN ('reset','verify')), expires_at timestamptz NOT NULL
);
CREATE INDEX account_tokens_owner ON account_tokens(author_id);
CREATE TABLE courses (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
 document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_owner_updated ON courses(owner_id,updated_at DESC);
CREATE TABLE course_assets (
 course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 asset_id text NOT NULL, data bytea NOT NULL, PRIMARY KEY(course_id,asset_id)
);
`},{version:2,sql:`
ALTER TABLE courses ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE courses ADD COLUMN last_save_id uuid;
ALTER TABLE courses ADD COLUMN last_save_hash text;
`},{version:3,sql:`
CREATE TABLE reusable_items (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('template','group','asset')), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
 project jsonb NOT NULL, stored_bytes integer NOT NULL CHECK(stored_bytes>0), request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reusable_owner_kind ON reusable_items(owner_id,kind,created_at DESC);
CREATE TABLE course_snapshots (
 id uuid PRIMARY KEY, course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE, title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
 source_revision integer NOT NULL CHECK(source_revision>0), project jsonb NOT NULL,
 stored_bytes integer NOT NULL CHECK(stored_bytes>0), request_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX snapshots_course_owner ON course_snapshots(course_id,owner_id,created_at DESC);
`},{version:4,sql:`
ALTER TABLE authors ADD COLUMN disabled_at timestamptz;
CREATE TABLE admin_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, operation text NOT NULL, author_id uuid REFERENCES authors(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
`},{version:5,sql:`
ALTER TABLE authors ADD COLUMN approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','revoked'));
ALTER TABLE authors ADD COLUMN role text NOT NULL DEFAULT 'author' CHECK (role IN ('owner','author'));
ALTER TABLE authors ADD COLUMN access_notified_at timestamptz;
ALTER TABLE admin_events ADD COLUMN actor_author_id uuid REFERENCES authors(id) ON DELETE SET NULL;
ALTER TABLE admin_events ADD COLUMN actor_kind text NOT NULL DEFAULT 'operator' CHECK (actor_kind IN ('operator','owner'));
CREATE TABLE access_request_notifications (
 author_id uuid PRIMARY KEY REFERENCES authors(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
 available_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, sent_at timestamptz
);
DELETE FROM author_sessions;
DELETE FROM account_tokens;
`}];
export async function migrate(pool:pg.Pool,afterMigrate?:(client:pg.PoolClient)=>Promise<void>) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':openscroll:migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied=await client.query<{version:number}>('SELECT version FROM schema_migrations');
    if (applied.rows.some(row => row.version > migrations.length)) throw new Error('The database schema is newer than this application.');
    for (const migration of migrations) {
      if (applied.rows.some(row => row.version === migration.version)) continue;
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)',[migration.version]);
    }
    if(afterMigrate)await afterMigrate(client);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function checkMigrations(pool:pg.Pool) {
  const result=await pool.query('SELECT max(version) AS version FROM schema_migrations');
  if (result.rows[0]?.version !== migrations.length) throw new Error('Run npm run db:migrate before starting OpenScroll.');
}
