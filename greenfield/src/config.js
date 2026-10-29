'use strict';
function loadConfig(env = process.env) {
  const port = Number.parseInt(env.PORT || '8080', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  return Object.freeze({ nodeEnv: env.NODE_ENV || 'development', port, publicBaseUrl: String(env.PUBLIC_BASE_URL || '').trim(), databaseUrl: String(env.DATABASE_URL || '').trim(), pgSsl: String(env.PGSSL || 'require').trim().toLowerCase(), diagnosticsToken: String(env.DB_DIAGNOSTICS_TOKEN || '') });
}
module.exports = { loadConfig };
