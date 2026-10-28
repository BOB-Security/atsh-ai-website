'use strict';

function required(name, env = process.env) {
  const value = env[name];
  if (!value || !String(value).trim()) throw new Error(`Missing required environment variable: ${name}`);
  return String(value).trim();
}
function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    nodeEnv: env.NODE_ENV || 'development',
    production,
    port: Number(env.PORT || 8080),
    databaseUrl: env.DATABASE_URL || '',
    sessionSecret: env.SESSION_SECRET || '',
    publicBaseUrl: env.PUBLIC_BASE_URL || '',
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean),
    ownerEmail: env.OWNER_EMAIL || '',
    resendApiKey: env.RESEND_API_KEY || '',
    emailFrom: env.EMAIL_FROM || '',
    aiProvider: env.AI_PROVIDER || '',
    aiBaseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1',
    aiApiKey: env.AI_API_KEY || '',
    aiModel: env.AI_MODEL || '',
    mfaEncryptionKey: env.MFA_ENCRYPTION_KEY || '',
    defaultOrganizationSlug: env.DEFAULT_ORGANIZATION_SLUG || 'atsh-ai',
    required
  };
}
module.exports = { loadConfig, required };
