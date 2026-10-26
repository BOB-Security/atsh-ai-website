'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadConfig}=require('../src/config');
const root=path.resolve(__dirname,'../..');
test('config defaults to a non-production local environment',()=>{const c=loadConfig({});assert.equal(c.production,false);assert.equal(c.port,8080);assert.equal(c.defaultOrganizationSlug,'atsh-ai');});
test('PostgreSQL schema includes core operational domains',()=>{const sql=fs.readFileSync(path.join(root,'db/schema.sql'),'utf8');for(const name of ['customers','leads','projects','project_stages','tasks','quotes','subscriptions','hosting_assets','backup_runs','ai_agents','knowledge_sources','conversations','messages','support_tickets','audit_logs','notifications'])assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+name+'\\b'));});
test('project delivery schema has explicit approval gate',()=>{const sql=fs.readFileSync(path.join(root,'db/002_auth_and_content.sql'),'utf8');assert.match(sql,/final_release/);assert.match(fs.readFileSync(path.join(root,'platform/src/routes/admin.js'),'utf8'),/لا يمكن بدء النشر أو التسليم النهائي دون موافقة نهائية صريحة مسجلة/);});
test('public intake requires explicit consent and validates user data',()=>{const routes=fs.readFileSync(path.join(root,'src/routes/public.js'),'utf8');assert.match(routes,/consent: z\.literal\(true\)/);assert.match(routes,/email: z\.string\(\)\.trim\(\)\.email/);});

test('quote and final-release approvals are token-based, not admin status toggles',()=>{const pub=fs.readFileSync(path.join(root,'platform/src/routes/public.js'),'utf8');const admin=fs.readFileSync(path.join(root,'platform/src/routes/admin.js'),'utf8');assert.match(pub,/router\.post\('\/quote-response'/);assert.match(pub,/approval_token_hash/);assert.match(admin,/router\.post\('\/quotes\/:id\/issue'/);assert.match(admin,/router\.post\('\/projects\/:id\/approvals'/);assert.match(admin,/لا يمكن بدء النشر أو التسليم النهائي دون موافقة نهائية صريحة مسجلة/);});
test('AI assistant uses approved knowledge and refuses unconfigured operation',()=>{const ai=fs.readFileSync(path.join(root,'platform/src/routes/assistant.js'),'utf8');assert.match(ai,/status=\\'approved\\'/);assert.match(ai,/No approved knowledge articles are available/);assert.match(ai,/cfg\.aiApiKey/);});
test('migration sequence includes approval, quote and team token schemas',()=>{for(const f of ['001_initial_schema.sql','002_auth_and_content.sql','003_knowledge_and_integrations.sql','004_team_invitations.sql','005_explicit_client_approvals.sql','006_quote_approval_tokens.sql','007_assistant_sessions.sql','008_customer_agent_runtime.sql'])assert.ok(fs.existsSync(path.join(root,'db',f)),f+' missing');});

test('assistant continuity uses opaque scoped session tokens and human escalation',()=>{const ai=fs.readFileSync(path.join(root,'platform/src/routes/assistant.js'),'utf8');assert.match(ai,/assistant_sessions/);assert.match(ai,/escalationTicketReference/);assert.match(ai,/status='waiting_human'/);});

test('pricing estimates are server-calculated and snapshot catalog items',()=>{const pub=fs.readFileSync(path.join(root,'platform/src/routes/public.js'),'utf8');assert.match(pub,/router\.get\('\/pricing'/);assert.match(pub,/router\.post\('\/pricing\/estimate'/);assert.match(pub,/BigInt\(plan\.setup_amount_minor\)/);assert.match(pub,/estimateOnly:true/);});
test('public support and project intake require consent',()=>{const pub=fs.readFileSync(path.join(root,'platform/src/routes/public.js'),'utf8');assert.match(pub,/router\.post\('\/support-tickets'/);assert.match(pub,/consent:\s*z\.literal\(true\)/);});

test('customer AI runtime is scoped to an active agent and its own approved knowledge',()=>{const ai=fs.readFileSync(path.join(root,'platform/src/routes/assistant.js'),'utf8');assert.match(ai,/router\.post\('\/agents\/:id\/chat'/);assert.match(ai,/c\.agent_id=\$3/);assert.match(ai,/agent_knowledge_documents WHERE agent_id=\$1 AND status=/);assert.match(ai,/monthly_token_limit/);});
