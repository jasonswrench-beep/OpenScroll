/** Trusted launchers must not pass maintenance credentials to application children. */
export const privilegedDatabaseKeys = ['ADMIN_DATABASE_URL', 'PROVISION_DATABASE_URL', 'POSTGRES_PASSWORD', 'MIGRATOR_DB_PASSWORD', 'RUNTIME_DB_PASSWORD', 'PGPASSWORD', 'PGPASSFILE', 'PGSERVICE', 'PGSERVICEFILE', 'PGUSER'];
export function runtimeEnvironment(input = process.env) {
  const result = { ...input };
  for (const key of privilegedDatabaseKeys) delete result[key];
  return result;
}
