'use strict';
const crypto = require('node:crypto');
const { getPool } = require('./db');

const SERVICE_TYPES = new Set(['landing','website','store','webapp','mobile','ai','hosting','custom','software','consulting','other']);
const SCOPE_TYPES = new Set(['small','medium','large','unknown']);
const BRAND_TYPES = new Set(['ready','need-logo','help','']);
const HOSTING_TYPES = new Set(['managed','own','later','none','undecided']);
const ADDONS = new Set(['copy','seo','analytics','chatbot','integrations','maintenance','security','unknown']);
const LANGUAGES = new Set(['ar','en']);

function validateInquiry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request body');
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const brief = String(input.brief || '').trim();
  const serviceType = String(input.serviceType || '').trim();
  const scope = String(input.scope || '').trim();
  const brand = String(input.brand || '').trim();
  const hosting = String(input.hosting || 'undecided').trim();
  const languages = Array.isArray(input.languages) ? [...new Set(input.languages.map(String))] : [];
  const addons = Array.isArray(input.addons) ? [...new Set(input.addons.map(String))] : [];
  const phone = String(input.phone || '').trim();
  const company = String(input.company || '').trim();
  if (name.length < 1 || name.length > 120) throw new Error('Name is required and must be 120 characters or fewer');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
  if (brief.length < 10 || brief.length > 4000) throw new Error('Project brief must be between 10 and 4000 characters');
  if (!SERVICE_TYPES.has(serviceType)) throw new Error('Select a valid service type');
  if (!SCOPE_TYPES.has(scope)) throw new Error('Select a project size or request help defining it');
  if (!BRAND_TYPES.has(brand)) throw new Error('Select a valid brand option');
  if (!HOSTING_TYPES.has(hosting)) throw new Error('Select a valid hosting preference');
  if (!languages.length || languages.some(value => !LANGUAGES.has(value))) throw new Error('Select at least one supported language');
  if (addons.length > 8 || addons.some(value => !ADDONS.has(value))) throw new Error('One or more add-on selections are invalid');
  if (phone.length > 40 || company.length > 160) throw new Error('Optional contact fields exceed their maximum length');
  if (input.consent !== true) throw new Error('Privacy consent is required');
  return { name, email, brief, serviceType, scope, brand, hosting, languages, addons, phone: phone || null, company: company || null, consent: true };
}

function makeReference(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return 'ATSH-' + date + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function createProjectInquiry(config, input) {
  const inquiry = validateInquiry(input);
  const pool = getPool(config);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const org = await client.query("SELECT id FROM organizations WHERE slug = $1 AND status = 'active' LIMIT 1", [config.organizationSlug]);
    if (!org.rowCount) {
      const error = new Error('ATSH organization is not configured in the existing database');
      error.code = 'ORGANIZATION_NOT_CONFIGURED';
      throw error;
    }
    const organizationId = org.rows[0].id;
    let customer = await client.query(
      'SELECT id FROM customers WHERE organization_id = $1 AND lower(email) = $2 ORDER BY created_at ASC LIMIT 1 FOR UPDATE',
      [organizationId, inquiry.email]
    );
    let customerId;
    if (customer.rowCount) {
      customerId = customer.rows[0].id;
    } else {
      const inserted = await client.query(
        "INSERT INTO customers (organization_id, display_name, legal_name, email, phone, preferred_locale, status, source) VALUES ($1,$2,$3,$4,$5,$6,'lead','website') ON CONFLICT (organization_id,email) DO NOTHING RETURNING id",
        [organizationId, inquiry.name, inquiry.company, inquiry.email, inquiry.phone, inquiry.languages.includes('ar') ? 'ar' : 'en']
      );
      customerId = inserted.rows[0]?.id;
      if (!customerId) {
        const existing = await client.query('SELECT id FROM customers WHERE organization_id = $1 AND lower(email) = $2 LIMIT 1', [organizationId, inquiry.email]);
        if (!existing.rowCount) throw new Error('Could not resolve customer record after insert');
        customerId = existing.rows[0].id;
      }
    }
    const reference = makeReference();
    const brief = {
      description: inquiry.brief,
      scope: inquiry.scope,
      languages: inquiry.languages,
      brand: inquiry.brand || null,
      addons: inquiry.addons,
      hosting: inquiry.hosting,
      schema_version: 1
    };
    await client.query(
      "INSERT INTO leads (organization_id, customer_id, reference, status, source, project_goal, solution_type, brief, consent_at) VALUES ($1,$2,$3,'new','website',$4,$5,$6::jsonb,NOW())",
      [organizationId, customerId, reference, inquiry.brief.slice(0, 240), inquiry.serviceType, JSON.stringify(brief)]
    );
    await client.query('COMMIT');
    return { reference };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function getPublicCatalog(config) {
  const pool = getPool(config);
  const org = await pool.query("SELECT id FROM organizations WHERE slug = $1 AND status = 'active' LIMIT 1", [config.organizationSlug]);
  if (!org.rowCount) {
    const error = new Error('ATSH organization is not configured in the existing database');
    error.code = 'ORGANIZATION_NOT_CONFIGURED';
    throw error;
  }
  const organizationId = org.rows[0].id;
  const settingsResult = await pool.query('SELECT settings FROM site_settings WHERE organization_id=$1 LIMIT 1', [organizationId]);
  const approved = config.catalogPublicationApproved === true && settingsResult.rows[0]?.settings?.catalog_publication_approved === true;
  const categories = await pool.query(
    `SELECT c.id, c.slug, c.name_ar, c.name_en, c.description_ar, c.description_en, c.sort_order,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name_ar', p.name_ar, 'name_en', p.name_en,
        'description_ar', p.description_ar, 'description_en', p.description_en,
        'features', p.features, 'features_en', p.features_en,
        'currency', p.currency,
        'setup_amount_minor', CASE WHEN $2::boolean THEN p.setup_amount_minor ELSE NULL END,
        'monthly_amount_minor', CASE WHEN $2::boolean THEN p.monthly_amount_minor ELSE NULL END,
        'annual_amount_minor', CASE WHEN $2::boolean THEN p.annual_amount_minor ELSE NULL END
      ) ORDER BY p.sort_order) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS plans
    FROM service_categories c
    LEFT JOIN service_plans p ON p.category_id = c.id AND p.organization_id = c.organization_id AND p.active = true
    WHERE c.organization_id = $1 AND c.active = true
    GROUP BY c.id ORDER BY c.sort_order`,
    [organizationId, approved]
  );
  const addons = await pool.query(
    `SELECT id, slug, name_ar, name_en, description_ar, description_en, currency,
      CASE WHEN $2::boolean THEN setup_amount_minor ELSE NULL END AS setup_amount_minor,
      CASE WHEN $2::boolean THEN monthly_amount_minor ELSE NULL END AS monthly_amount_minor,
      CASE WHEN $2::boolean THEN annual_amount_minor ELSE NULL END AS annual_amount_minor
     FROM service_addons WHERE organization_id = $1 AND active = true ORDER BY name_ar`,
    [organizationId, approved]
  );
  return { categories: categories.rows, addons: addons.rows, pricing: approved ? 'approved' : 'approval_required' };
}

module.exports = { validateInquiry, createProjectInquiry, getPublicCatalog, makeReference };
