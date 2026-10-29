'use strict';
function loadConfig(env = process.env) {
  const port = Number.parseInt(env.PORT || '8080', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  const organizationId = String(env.PUBLIC_ORGANIZATION_ID || '').trim();
  const validOrganizationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId);
  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development',
    port,
    publicBaseUrl: String(env.PUBLIC_BASE_URL || '').trim(),
    databaseUrl: String(env.DATABASE_URL || '').trim(),
    pgSsl: String(env.PGSSL || 'require').trim().toLowerCase(),
    diagnosticsToken: String(env.DB_DIAGNOSTICS_TOKEN || ''),
    intakeEnabled: String(env.INQUIRY_INTAKE_ENABLED || '').trim().toLowerCase() === 'true',
    publicOrganizationId: validOrganizationId ? organizationId : ''
  });
}
module.exports = { loadConfig };
