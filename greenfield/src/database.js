'use strict';
const { Pool } = require('pg');

const INQUIRY_COLUMNS = {
  customers: ['id','organization_id','display_name','email','phone','preferred_locale','status','source','created_at','updated_at'],
  leads: ['id','organization_id','customer_id','reference','status','source','project_goal','solution_type','brief','consent_at','created_at','updated_at']
};

function createDatabase(config, dependencies = {}) {
  let pool;
  const poolFactory = dependencies.poolFactory || (options => new Pool(options));
  function getPool() {
    if (!config.databaseUrl) { const e = new Error('DATABASE_URL is not configured'); e.code = 'DATABASE_NOT_CONFIGURED'; throw e; }
    if (!pool) {
      pool = poolFactory({ connectionString: config.databaseUrl, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, application_name: 'atsh-ai-greenfield', ssl: config.pgSsl === 'disable' ? false : config.pgSsl === 'require' ? { rejectUnauthorized: true } : undefined });
      pool.on('error', error => console.error('PostgreSQL idle client error:', error.code || 'unknown'));
    }
    return pool;
  }
  async function checkConnection() {
    const result = await getPool().query('SELECT 1 AS connected');
    return result.rows[0] && result.rows[0].connected === 1;
  }
  async function inspectSchema() {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      const result = await client.query("SELECT table_schema, table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position");
      await client.query('COMMIT');
      return result.rows;
    } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
    finally { client.release(); }
  }
  async function createInquiry(input) {
    if (!config.intakeEnabled || !config.publicOrganizationId) {
      const error = new Error('Inquiry intake has not been enabled after schema review.');
      error.code = 'INTAKE_NOT_ENABLED';
      throw error;
    }
    const client = await getPool().connect();
    try {
      const schema = await client.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('customers','leads')"
      );
      const found = new Map();
      for (const row of schema.rows) {
        if (!found.has(row.table_name)) found.set(row.table_name, new Set());
        found.get(row.table_name).add(row.column_name);
      }
      for (const [table, required] of Object.entries(INQUIRY_COLUMNS)) {
        if (!found.has(table) || required.some(column => !found.get(table).has(column))) {
          const error = new Error('Required inquiry schema has not been verified.');
          error.code = 'INTAKE_SCHEMA_MISMATCH';
          throw error;
        }
      }

      await client.query('BEGIN');
      const existing = await client.query(
        "SELECT id FROM customers WHERE organization_id = $1 AND lower(email) = lower($2) LIMIT 1",
        [config.publicOrganizationId, input.email]
      );
      let customerId;
      if (existing.rows[0]) {
        customerId = existing.rows[0].id;
      } else {
        const createdCustomer = await client.query(
          "INSERT INTO customers (organization_id, display_name, email, phone, preferred_locale, status, source) VALUES ($1,$2,$3,$4,'ar','lead','website') ON CONFLICT (organization_id, email) DO NOTHING RETURNING id",
          [config.publicOrganizationId, input.name, input.email.toLowerCase(), input.phone || null]
        );
        if (createdCustomer.rows[0]) {
          customerId = createdCustomer.rows[0].id;
        } else {
          const raced = await client.query(
            "SELECT id FROM customers WHERE organization_id = $1 AND lower(email) = lower($2) LIMIT 1",
            [config.publicOrganizationId, input.email]
          );
          if (!raced.rows[0]) throw new Error('Customer could not be resolved after concurrent insert.');
          customerId = raced.rows[0].id;
        }
      }

      const reference = 'ATSH-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + require('node:crypto').randomBytes(4).toString('hex').toUpperCase();
      const brief = {
        company: input.company || '',
        service: input.service,
        size: input.size || '',
        pages: input.pages || '',
        languages: input.languages || '',
        brand: input.brand || '',
        features: input.features || [],
        hosting: input.hosting || '',
        audience: input.audience || '',
        integrations: input.integrations || '',
        deadline: input.deadline || '',
        constraints: input.constraints || ''
      };
      const createdLead = await client.query(
        "INSERT INTO leads (organization_id, customer_id, reference, status, source, project_goal, solution_type, brief, consent_at) VALUES ($1,$2,$3,'new','website',$4,$5,$6::jsonb,now()) RETURNING id, reference, status, created_at",
        [config.publicOrganizationId, customerId, reference, input.goal, input.service, JSON.stringify(brief)]
      );
      await client.query('COMMIT');
      return createdLead.rows[0];
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }
  async function listPublicCatalog() {
    if (!config.publicOrganizationId) {
      const error = new Error('Public catalog organization has not been configured.');
      error.code = 'CATALOG_NOT_CONFIGURED';
      throw error;
    }
    const client = await getPool().connect();
    try {
      const schema = await client.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('service_categories','service_plans')"
      );
      const found = new Map();
      for (const row of schema.rows) {
        if (!found.has(row.table_name)) found.set(row.table_name, new Set());
        found.get(row.table_name).add(row.column_name);
      }
      const required = {
        service_categories: ['id','organization_id','slug','name_ar','name_en','description_ar','description_en','active','sort_order'],
        service_plans: ['id','organization_id','category_id','slug','name_ar','name_en','description_ar','description_en','setup_amount_minor','monthly_amount_minor','annual_amount_minor','currency','features','active','sort_order']
      };
      for (const [table, columns] of Object.entries(required)) {
        if (!found.has(table) || columns.some(column => !found.get(table).has(column))) {
          const error = new Error('Public catalog schema has not been verified.');
          error.code = 'CATALOG_SCHEMA_MISMATCH';
          throw error;
        }
      }
      const result = await client.query(
        `SELECT
           c.id AS category_id, c.slug AS category_slug, c.name_ar AS category_name_ar,
           c.name_en AS category_name_en, c.description_ar AS category_description_ar,
           c.description_en AS category_description_en, c.sort_order AS category_sort_order,
           p.id AS plan_id, p.slug AS plan_slug, p.name_ar AS plan_name_ar, p.name_en AS plan_name_en,
           p.description_ar AS plan_description_ar, p.description_en AS plan_description_en,
           p.setup_amount_minor::text AS setup_amount_minor,
           p.monthly_amount_minor::text AS monthly_amount_minor,
           p.annual_amount_minor::text AS annual_amount_minor,
           p.currency AS currency, p.features AS features, p.sort_order AS plan_sort_order
         FROM service_categories c
         LEFT JOIN service_plans p
           ON p.category_id = c.id
          AND p.organization_id = c.organization_id
          AND p.active = true
         WHERE c.organization_id = $1 AND c.active = true
         ORDER BY c.sort_order, c.name_ar, p.sort_order, p.name_ar`,
        [config.publicOrganizationId]
      );
      const categories = new Map();
      for (const row of result.rows) {
        if (!categories.has(row.category_id)) {
          categories.set(row.category_id, {
            id: row.category_id,
            slug: row.category_slug,
            name: { ar: row.category_name_ar, en: row.category_name_en },
            description: { ar: row.category_description_ar, en: row.category_description_en },
            plans: []
          });
        }
        if (row.plan_id) {
          categories.get(row.category_id).plans.push({
            id: row.plan_id,
            slug: row.plan_slug,
            name: { ar: row.plan_name_ar, en: row.plan_name_en },
            description: { ar: row.plan_description_ar, en: row.plan_description_en },
            amountsMinor: {
              setup: row.setup_amount_minor,
              monthly: row.monthly_amount_minor,
              annual: row.annual_amount_minor
            },
            currency: String(row.currency || '').trim(),
            features: Array.isArray(row.features) ? row.features : [],
          });
        }
      }
      return Array.from(categories.values());
    } finally {
      client.release();
    }
  }

  async function assertAdminSchema(client) {
    const result = await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('users','organizations','roles','user_roles','auth_sessions','audit_logs')"
    );
    const found = new Map();
    for (const row of result.rows) {
      if (!found.has(row.table_name)) found.set(row.table_name, new Set());
      found.get(row.table_name).add(row.column_name);
    }
    const required = {
      users: ['id','organization_id','email','full_name','password_hash','status','last_login_at','updated_at'],
      organizations: ['id','status'],
      roles: ['id','organization_id','name','permissions'],
      user_roles: ['user_id','role_id'],
      auth_sessions: ['id','user_id','token_hash','expires_at','last_seen_at','created_at'],
      audit_logs: ['id','organization_id','actor_user_id','action','entity_type','entity_id','details','ip_hash','created_at']
    };
    for (const [table, columns] of Object.entries(required)) {
      if (!found.has(table) || columns.some(column => !found.get(table).has(column))) {
        const error = new Error('Admin authentication schema has not been verified.');
        error.code = 'ADMIN_SCHEMA_MISMATCH';
        throw error;
      }
    }
  }
  async function findAdminUser(email) {
    const client = await getPool().connect();
    try {
      await assertAdminSchema(client);
      const result = await client.query(
        `SELECT u.id, u.organization_id, u.email, u.full_name, u.password_hash,
                u.status, o.status AS organization_status,
                COALESCE(jsonb_agg(DISTINCT r.permissions) FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb) AS role_permission_sets
           FROM users u
           JOIN organizations o ON o.id = u.organization_id
           LEFT JOIN user_roles ur ON ur.user_id = u.id
           LEFT JOIN roles r ON r.id = ur.role_id AND (r.organization_id = u.organization_id OR r.organization_id IS NULL)
          WHERE lower(u.email) = lower($1)
          GROUP BY u.id, o.status
          LIMIT 1`,
        [email]
      );
      return result.rows[0] || null;
    } finally { client.release(); }
  }
  async function createAdminSession(userId, tokenHash, metadata = {}) {
    const client = await getPool().connect();
    try {
      await assertAdminSchema(client);
      await client.query('BEGIN');
      const result = await client.query(
        "INSERT INTO auth_sessions (user_id, token_hash, expires_at) SELECT $1,$2,now() + interval '8 hours' WHERE EXISTS (SELECT 1 FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=$1 AND u.status='active' AND o.status='active') RETURNING id, expires_at",
        [userId, tokenHash]
      );
      if (!result.rows[0]) { const error = new Error('Admin account is no longer active.'); error.code = 'ADMIN_NOT_ACTIVE'; throw error; }
      const actor = await client.query("SELECT organization_id FROM users WHERE id=$1 AND status='active'", [userId]);
      if (!actor.rows[0]) { const error = new Error('Admin account is no longer active.'); error.code = 'ADMIN_NOT_ACTIVE'; throw error; }
      await client.query("UPDATE users SET last_login_at=now(), updated_at=now() WHERE id=$1", [userId]);
      await client.query(
        "INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, details, ip_hash) VALUES ($1,$2,'admin.login','auth_session',$3,$4::jsonb,$5)",
        [actor.rows[0].organization_id, userId, result.rows[0].id, JSON.stringify({ outcome: 'success' }), typeof metadata.ipHash === 'string' ? metadata.ipHash : null]
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (error.code === '42P01' || error.code === '42703') error.code = 'ADMIN_SCHEMA_MISMATCH';
      throw error;
    } finally { client.release(); }
  }
  async function getAdminSession(tokenHash) {
    const client = await getPool().connect();
    try {
      await assertAdminSchema(client);
      const result = await client.query(
        `SELECT u.id, u.organization_id, u.email, u.full_name, u.status,
                o.status AS organization_status, s.expires_at,
                COALESCE(jsonb_agg(DISTINCT r.permissions) FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb) AS role_permission_sets
           FROM auth_sessions s
           JOIN users u ON u.id=s.user_id
           JOIN organizations o ON o.id=u.organization_id
           LEFT JOIN user_roles ur ON ur.user_id=u.id
           LEFT JOIN roles r ON r.id=ur.role_id AND (r.organization_id=u.organization_id OR r.organization_id IS NULL)
          WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND o.status='active'
          GROUP BY u.id, o.status, s.expires_at
          LIMIT 1`,
        [tokenHash]
      );
      if (!result.rows[0]) return null;
      await client.query("UPDATE auth_sessions SET last_seen_at=now() WHERE token_hash=$1", [tokenHash]);
      return result.rows[0];
    } finally { client.release(); }
  }
  async function deleteAdminSession(tokenHash, metadata = {}) {
    const client = await getPool().connect();
    try {
      await assertAdminSchema(client);
      await client.query('BEGIN');
      const session = await client.query(
        "SELECT s.id AS session_id,u.id AS user_id,u.organization_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1",
        [tokenHash]
      );
      if (session.rows[0]) {
        await client.query("INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,details,ip_hash) VALUES ($1,$2,'admin.logout','auth_session',$3,$4::jsonb,$5)",
          [session.rows[0].organization_id,session.rows[0].user_id,session.rows[0].session_id,JSON.stringify({ outcome: 'success' }),typeof metadata.ipHash === 'string' ? metadata.ipHash : null]);
        await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [tokenHash]);
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (error.code === '42P01' || error.code === '42703') error.code = 'ADMIN_SCHEMA_MISMATCH';
      throw error;
    } finally { client.release(); }
  }
  async function getAdminOverview(organizationId) {
    if (!organizationId) { const error = new Error('Organization is missing.'); error.code = 'ADMIN_NOT_CONFIGURED'; throw error; }
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT
          (SELECT count(*)::int FROM leads WHERE organization_id=$1) AS leads_total,
          (SELECT count(*)::int FROM leads WHERE organization_id=$1 AND status='new') AS leads_new,
          (SELECT count(*)::int FROM projects WHERE organization_id=$1) AS projects_total,
          (SELECT count(*)::int FROM support_tickets WHERE organization_id=$1 AND status NOT IN ('closed','resolved')) AS tickets_open,
          (SELECT count(*)::int FROM service_categories WHERE organization_id=$1 AND active=true) AS categories_active,
          (SELECT count(*)::int FROM service_plans WHERE organization_id=$1 AND active=true) AS plans_active`,
        [organizationId]
      );
      return result.rows[0];
    } catch (error) {
      if (error.code === '42P01' || error.code === '42703') { error.code = 'ADMIN_OVERVIEW_SCHEMA_MISMATCH'; }
      throw error;
    } finally { client.release(); }
  }


  async function listAdminCatalog(organizationId) {
    if (!organizationId) { const error = new Error('Organization is missing.'); error.code = 'ADMIN_NOT_CONFIGURED'; throw error; }
    const client = await getPool().connect();
    try {
      const schema = await client.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('service_categories','service_plans')"
      );
      const found = new Map();
      for (const row of schema.rows) {
        if (!found.has(row.table_name)) found.set(row.table_name, new Set());
        found.get(row.table_name).add(row.column_name);
      }
      const required = {
        service_categories: ['id','organization_id','slug','name_ar','name_en','description_ar','description_en','active','sort_order'],
        service_plans: ['id','organization_id','category_id','slug','name_ar','name_en','description_ar','description_en','setup_amount_minor','monthly_amount_minor','annual_amount_minor','currency','features','active','sort_order']
      };
      for (const [table, columns] of Object.entries(required)) {
        if (!found.has(table) || columns.some(column => !found.get(table).has(column))) {
          const error = new Error('Admin catalog schema has not been verified.'); error.code = 'ADMIN_CATALOG_SCHEMA_MISMATCH'; throw error;
        }
      }
      const result = await client.query(
        `SELECT c.id AS category_id,c.slug AS category_slug,c.name_ar AS category_name_ar,c.name_en AS category_name_en,
                c.description_ar AS category_description_ar,c.description_en AS category_description_en,c.active AS category_active,
                c.sort_order AS category_sort_order,p.id AS plan_id,p.slug AS plan_slug,p.name_ar AS plan_name_ar,p.name_en AS plan_name_en,
                p.description_ar AS plan_description_ar,p.description_en AS plan_description_en,p.setup_amount_minor::text AS setup_amount_minor,
                p.monthly_amount_minor::text AS monthly_amount_minor,p.annual_amount_minor::text AS annual_amount_minor,
                p.currency,p.features,p.active AS plan_active,p.sort_order AS plan_sort_order
           FROM service_categories c
           LEFT JOIN service_plans p ON p.category_id=c.id AND p.organization_id=c.organization_id
          WHERE c.organization_id=$1
          ORDER BY c.sort_order,c.name_ar,p.sort_order,p.name_ar`,
        [organizationId]
      );
      const categories = new Map();
      for (const row of result.rows) {
        if (!categories.has(row.category_id)) categories.set(row.category_id, {
          id: row.category_id, slug: row.category_slug, name: {ar:row.category_name_ar,en:row.category_name_en},
          description: {ar:row.category_description_ar,en:row.category_description_en}, active: row.category_active === true, plans: []
        });
        if (row.plan_id) categories.get(row.category_id).plans.push({
          id: row.plan_id, slug: row.plan_slug, name: {ar:row.plan_name_ar,en:row.plan_name_en},
          description: {ar:row.plan_description_ar,en:row.plan_description_en},
          amountsMinor: {setup:row.setup_amount_minor,monthly:row.monthly_amount_minor,annual:row.annual_amount_minor},
          currency:String(row.currency||'').trim(), features:Array.isArray(row.features)?row.features:[], active:row.plan_active===true
        });
      }
      return [...categories.values()];
    } finally { client.release(); }
  }


  async function saveAdminPlan(organizationId, userId, input) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const category = await client.query('SELECT id FROM service_categories WHERE id=$1 AND organization_id=$2', [input.category_id, organizationId]);
      if (!category.rows.length) { const error = new Error('Category not found.'); error.code = 'ADMIN_CATALOG_CATEGORY_NOT_FOUND'; throw error; }
      let result;
      const values = [organizationId,input.category_id,input.slug,input.name_ar,input.name_en,input.description_ar,input.description_en,input.setup_amount_minor,input.monthly_amount_minor,input.annual_amount_minor,input.currency,JSON.stringify(input.features),input.active,input.sort_order];
      if (input.id) {
        result = await client.query('UPDATE service_plans SET category_id=$3,slug=$4,name_ar=$5,name_en=$6,description_ar=$7,description_en=$8,setup_amount_minor=$9,monthly_amount_minor=$10,annual_amount_minor=$11,currency=$12,features=$13::jsonb,active=$14,sort_order=$15 WHERE id=$1 AND organization_id=$2 RETURNING id',
          [input.id, ...values]);
      } else {
        result = await client.query('INSERT INTO service_plans (organization_id,category_id,slug,name_ar,name_en,description_ar,description_en,setup_amount_minor,monthly_amount_minor,annual_amount_minor,currency,features,active,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) RETURNING id', values);
      }
      if (!result.rows.length) { const error = new Error('Plan not found.'); error.code = 'ADMIN_CATALOG_PLAN_NOT_FOUND'; throw error; }
      await client.query("INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,details,ip_hash) VALUES ($1,$2,$3,'service_plan',$4,$5::jsonb,NULL)",
        [organizationId,userId,input.id?'catalog.plan.update':'catalog.plan.create',result.rows[0].id,JSON.stringify({slug:input.slug,active:input.active})]);
      await client.query('COMMIT');
      return {id:result.rows[0].id};
    } catch(error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
    finally { client.release(); }
  }

  async function listAdminLeads(organizationId, limit = 50) {
    if (!organizationId) { const error = new Error('Organization is missing.'); error.code = 'ADMIN_NOT_CONFIGURED'; throw error; }
    const client = await getPool().connect();
    try {
      const schema = await client.query(
        "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('leads','customers')"
      );
      const found = new Map();
      for (const row of schema.rows) {
        if (!found.has(row.table_name)) found.set(row.table_name, new Set());
        found.get(row.table_name).add(row.column_name);
      }
      const required = {
        leads: ['id','organization_id','customer_id','reference','status','source','project_goal','solution_type','created_at'],
        customers: ['id','organization_id','display_name','email','phone']
      };
      for (const [table, columns] of Object.entries(required)) {
        if (!found.has(table) || columns.some(column => !found.get(table).has(column))) {
          const error = new Error('Admin leads schema has not been verified.'); error.code = 'ADMIN_LEADS_SCHEMA_MISMATCH'; throw error;
        }
      }
      const result = await client.query(
        `SELECT l.id,l.reference,l.status,l.source,l.project_goal,l.solution_type,l.created_at,
                c.display_name AS customer_name,c.email AS customer_email,c.phone AS customer_phone
           FROM leads l
           LEFT JOIN customers c ON c.id=l.customer_id AND c.organization_id=l.organization_id
          WHERE l.organization_id=$1
          ORDER BY l.created_at DESC
          LIMIT $2`,
        [organizationId, Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 50))]
      );
      return result.rows;
    } finally { client.release(); }
  }

  async function listAdminMembers(organizationId) {
    const client=await getPool().connect();
    try {
      const roles=await client.query('SELECT id,name,permissions FROM roles WHERE organization_id=$1 ORDER BY name',[organizationId]);
      const users=await client.query(`SELECT u.id,u.email,u.full_name,u.status,u.last_login_at,COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',r.id,'name',r.name)) FILTER (WHERE r.id IS NOT NULL),'[]'::jsonb) AS roles
        FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id AND r.organization_id=u.organization_id
        WHERE u.organization_id=$1 GROUP BY u.id ORDER BY u.updated_at DESC LIMIT 200`,[organizationId]);
      return {roles:roles.rows,members:users.rows};
    } finally {client.release();}
  }
  async function createAdminMember(organizationId,actorId,input) {
    const client=await getPool().connect();
    try {
      await client.query('BEGIN');
      const role=await client.query('SELECT id FROM roles WHERE id=$1 AND organization_id=$2',[input.role_id,organizationId]);
      if(!role.rows.length){const error=new Error('Role not found.');error.code='ADMIN_ROLE_NOT_FOUND';throw error;}
      const inserted=await client.query("INSERT INTO users (organization_id,email,full_name,password_hash,status,updated_at) VALUES ($1,lower($2),$3,$4,'active',now()) RETURNING id,email,full_name,status",
        [organizationId,input.email,input.full_name,input.password_hash]);
      const user=inserted.rows[0];
      await client.query('INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2)',[user.id,input.role_id]);
      await client.query("INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,details,ip_hash) VALUES ($1,$2,'admin.member.create','user',$3,$4::jsonb,NULL)",
        [organizationId,actorId,user.id,JSON.stringify({email:user.email,role_id:input.role_id})]);
      await client.query('COMMIT');return user;
    } catch(error){try{await client.query('ROLLBACK');}catch{}if(error.code==='23505')error.code='ADMIN_MEMBER_EMAIL_EXISTS';throw error;}
    finally{client.release();}
  }

  async function checkAdminPasswordRecoveryReady() {
    try {
      const result = await getPool().query("SELECT to_regclass('public.admin_password_resets') IS NOT NULL AS ready");
      return result.rows[0]?.ready === true;
    } catch { return false; }
  }
  async function createAdminPasswordReset(email, tokenHash, metadata = {}) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await assertAdminSchema(client);
      const found = await client.query(
        "SELECT u.id,u.organization_id,u.email,u.full_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE lower(u.email)=lower($1) AND u.status='active' AND o.status='active' LIMIT 1",
        [email]
      );
      if (!found.rows[0]) { await client.query('COMMIT'); return null; }
      const user = found.rows[0];
      await client.query('DELETE FROM admin_password_resets WHERE user_id=$1 OR expires_at<=now() OR used_at IS NOT NULL', [user.id]);
      await client.query("INSERT INTO admin_password_resets (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 minutes')", [tokenHash,user.id]);
      await client.query("INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,details,ip_hash) VALUES ($1,$2,'admin.password_recovery.request','user',$2,$3::jsonb,$4)",
        [user.organization_id,user.id,JSON.stringify({outcome:'requested'}),typeof metadata.ipHash==='string'?metadata.ipHash:null]);
      await client.query('COMMIT');
      return { id:user.id,email:user.email,full_name:user.full_name };
    } catch(error) {
      try { await client.query('ROLLBACK'); } catch {}
      if(error.code==='42P01'||error.code==='42703')error.code='ADMIN_RECOVERY_SCHEMA_MISMATCH';
      throw error;
    } finally { client.release(); }
  }
  async function completeAdminPasswordReset(tokenHash, passwordHash, metadata = {}) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await assertAdminSchema(client);
      const found = await client.query(
        "SELECT r.user_id,u.organization_id,u.status,o.status AS organization_status FROM admin_password_resets r JOIN users u ON u.id=r.user_id JOIN organizations o ON o.id=u.organization_id WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at>now() FOR UPDATE OF r",
        [tokenHash]
      );
      const reset=found.rows[0];
      if(!reset||reset.status!=='active'||reset.organization_status!=='active') {
        await client.query('ROLLBACK'); return false;
      }
      await client.query("UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1 AND status='active'",[reset.user_id,passwordHash]);
      await client.query('DELETE FROM auth_sessions WHERE user_id=$1',[reset.user_id]);
      await client.query('DELETE FROM admin_password_resets WHERE user_id=$1',[reset.user_id]);
      await client.query("INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,details,ip_hash) VALUES ($1,$2,'admin.password_recovery.complete','user',$2,$3::jsonb,$4)",
        [reset.organization_id,reset.user_id,JSON.stringify({outcome:'password_changed_sessions_revoked'}),typeof metadata.ipHash==='string'?metadata.ipHash:null]);
      await client.query('COMMIT'); return true;
    } catch(error) {
      try { await client.query('ROLLBACK'); } catch {}
      if(error.code==='42P01'||error.code==='42703')error.code='ADMIN_RECOVERY_SCHEMA_MISMATCH';
      throw error;
    } finally { client.release(); }
  }

  async function getSiteSettings(organizationId) {
    if (!organizationId) { const error = new Error('Organization is missing.'); error.code = 'SITE_SETTINGS_NOT_CONFIGURED'; throw error; }
    const client = await getPool().connect();
    try {
      const schema = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='site_settings'");
      const names = new Set(schema.rows.map(row => row.column_name));
      if (!['organization_id','settings','updated_by','updated_at'].every(name => names.has(name))) { const error = new Error('Site settings schema is not installed.'); error.code = 'SITE_SETTINGS_SCHEMA_MISMATCH'; throw error; }
      const result = await client.query('SELECT settings, updated_at FROM site_settings WHERE organization_id=$1', [organizationId]);
      return result.rows[0] || { settings: {}, updated_at: null };
    } finally { client.release(); }
  }
  async function saveSiteSettings(organizationId, userId, settings) {
    if (!organizationId || !userId) { const error = new Error('Organization or actor is missing.'); error.code = 'SITE_SETTINGS_NOT_CONFIGURED'; throw error; }
    const client = await getPool().connect();
    try {
      const schema = await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('site_settings','audit_logs')");
      const found = new Map(); for (const row of schema.rows) { if (!found.has(row.table_name)) found.set(row.table_name,new Set()); found.get(row.table_name).add(row.column_name); }
      if (!['organization_id','settings','updated_by','updated_at'].every(name => found.get('site_settings')?.has(name)) || !['organization_id','actor_user_id','action','entity_type','entity_id','details','ip_hash','created_at'].every(name => found.get('audit_logs')?.has(name))) { const error = new Error('Site settings or audit schema is not installed.'); error.code = 'SITE_SETTINGS_SCHEMA_MISMATCH'; throw error; }
      await client.query('BEGIN');
      await client.query('INSERT INTO site_settings (organization_id,settings,updated_by,updated_at) VALUES ($1,$2::jsonb,$3,now()) ON CONFLICT (organization_id) DO UPDATE SET settings=EXCLUDED.settings,updated_by=EXCLUDED.updated_by,updated_at=now()', [organizationId,JSON.stringify(settings),userId]);
      await client.query("INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,details,ip_hash) VALUES ($1,$2,'site.settings.update','site_settings',$1,$3::jsonb,NULL)", [organizationId,userId,JSON.stringify({keys:Object.keys(settings)})]);
      await client.query('COMMIT'); return {settings,updated_at:new Date().toISOString()};
    } catch(error) { try { await client.query('ROLLBACK'); } catch {} if(error.code==='42P01'||error.code==='42703')error.code='SITE_SETTINGS_SCHEMA_MISMATCH'; throw error; }
    finally { client.release(); }
  }
  async function close() { if (pool) { const current = pool; pool = undefined; await current.end(); } }
  return { checkConnection, inspectSchema, createInquiry, listPublicCatalog, findAdminUser, createAdminSession, getAdminSession, deleteAdminSession, getAdminOverview, listAdminCatalog, saveAdminPlan, listAdminLeads, listAdminMembers, createAdminMember, checkAdminPasswordRecoveryReady, createAdminPasswordReset, completeAdminPasswordReset, getSiteSettings, saveSiteSettings, close };
}
module.exports = { createDatabase };
