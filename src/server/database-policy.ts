/** Reviewed runtime access to the public OpenScroll schema. New objects get no automatic grants. */
export const RUNTIME_ROLE='openscroll_app';
export const MIGRATOR_ROLE='openscroll_migrator';
export const RUNTIME_TABLE_GRANTS:Readonly<Record<string,readonly string[]>>={
  authors:['SELECT'],
  author_sessions:['SELECT','INSERT','DELETE'],
  account_tokens:['SELECT','INSERT','DELETE'],
  courses:['SELECT','INSERT','UPDATE','DELETE'],
  course_assets:['SELECT','INSERT','DELETE'],
  reusable_items:['SELECT','INSERT','DELETE'],
  course_snapshots:['SELECT','INSERT','DELETE'],
  admin_events:['SELECT','INSERT'],
  access_request_notifications:['SELECT','INSERT','UPDATE'],
  schema_migrations:['SELECT'],
};
export const RUNTIME_COLUMN_GRANTS:Readonly<Record<string,Readonly<Record<string,readonly string[]>>>>={
  authors:{INSERT:['id','email','display_name','password_hash','verified'],UPDATE:['password_hash','verified','approval_status','access_notified_at']},
};
// GENERATED ALWAYS AS IDENTITY does not require sequence access for an INSERT.
// In particular the runtime cannot call nextval/setval directly or reset audit IDs.
export const RUNTIME_SEQUENCE_GRANTS:Readonly<Record<string,readonly string[]>>={admin_events_id_seq:[]};
export const APPLICATION_TABLES=Object.keys(RUNTIME_TABLE_GRANTS);
export const APPLICATION_SEQUENCES=Object.keys(RUNTIME_SEQUENCE_GRANTS);
export const APPLICATION_COLUMNS:Readonly<Record<string,readonly string[]>>={
  authors:['id','email','display_name','password_hash','verified','created_at','disabled_at','approval_status','role','access_notified_at'],
  author_sessions:['token_hash','author_id','csrf_token','expires_at'],
  account_tokens:['token_hash','author_id','purpose','expires_at'],
  courses:['id','owner_id','document','created_at','updated_at','revision','last_save_id','last_save_hash'],
  course_assets:['course_id','asset_id','data'],
  reusable_items:['id','owner_id','kind','title','project','stored_bytes','request_hash','created_at'],
  course_snapshots:['id','course_id','owner_id','title','source_revision','project','stored_bytes','request_hash','created_at'],
  admin_events:['id','operation','author_id','created_at','actor_author_id','actor_kind'],
  access_request_notifications:['author_id','status','attempts','available_at','claimed_at','sent_at'],
  schema_migrations:['version','applied_at'],
};
export const APPLICATION_INDEXES=[
  'authors_pkey','authors_email_key','author_sessions_pkey','author_sessions_owner',
  'account_tokens_pkey','account_tokens_owner','courses_pkey','courses_owner_updated',
  'course_assets_pkey','reusable_items_pkey','reusable_owner_kind','course_snapshots_pkey',
  'snapshots_course_owner','admin_events_pkey','access_request_notifications_pkey','schema_migrations_pkey',
] as readonly string[];
// These PUBLIC-executable builtins can create durable objects without CREATE/TEMP.
export const FORBIDDEN_RUNTIME_ROUTINES=[
  'pg_catalog.lo_create(oid)','pg_catalog.lo_creat(integer)','pg_catalog.lo_from_bytea(oid,bytea)',
  'pg_catalog.lo_import(text)','pg_catalog.lo_import(text,oid)','pg_catalog.lo_export(oid,text)',
] as readonly string[];
export const FORBIDDEN_RUNTIME_FUNCTION_NAMES=[
  'pg_read_file','pg_read_binary_file','pg_ls_dir','pg_stat_file','pg_ls_logdir','pg_ls_waldir',
  'pg_ls_archive_statusdir','pg_ls_logicalmapdir','pg_ls_logicalsnapdir','pg_ls_tmpdir','pg_ls_replslotdir',
  'pg_reload_conf','pg_rotate_logfile',
] as readonly string[];
