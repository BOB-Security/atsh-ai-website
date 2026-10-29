'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDatabase}=require('../src/database');

const orgId='11111111-1111-4111-8111-111111111111';
const config={databaseUrl:'postgres://test.invalid/db',pgSsl:'disable',publicOrganizationId:orgId,intakeEnabled:false};

const columns={
 service_categories:['id','organization_id','slug','name_ar','name_en','description_ar','description_en','active','sort_order'],
 service_plans:['id','organization_id','category_id','slug','name_ar','name_en','description_ar','description_en','setup_amount_minor','monthly_amount_minor','annual_amount_minor','currency','features','active','sort_order']
};
function schemaRows(overrides=columns){
 return Object.entries(overrides).flatMap(([table_name,names])=>names.map(column_name=>({table_name,column_name})));
}
function fakePool({schema=schemaRows(),catalogRows=[]}={}){
 const calls=[];
 let released=0;
 const client={
  async query(sql,params=[]){
   calls.push({sql,params});
   if(sql.includes('information_schema.columns'))return {rows:schema};
   if(sql.includes('FROM service_categories c'))return {rows:catalogRows};
   throw new Error('Unexpected SQL in public catalog test: '+sql);
  },
  release(){released++;}
 };
 const pool={on(){},async connect(){return client;},async end(){}};
 return {poolFactory:()=>pool,calls,get released(){return released;}};
}
test('public catalog is organization-scoped and read-only',async()=>{
 const fake=fakePool({catalogRows:[{
  category_id:'cat-1',category_slug:'web',category_name_ar:'المواقع',category_name_en:'Web',
  category_description_ar:'مواقع الشركات',category_description_en:'Company websites',category_sort_order:1,
  plan_id:'plan-1',plan_slug:'starter',plan_name_ar:'أساسي',plan_name_en:'Starter',
  plan_description_ar:'باقة أساسية',plan_description_en:'Starter plan',
  setup_amount_minor:'50000',monthly_amount_minor:'12000',annual_amount_minor:'120000',
  currency:'EGP',features:['Responsive design'],plan_sort_order:1
 }]});
 const db=createDatabase(config,{poolFactory:fake.poolFactory});
 const catalog=await db.listPublicCatalog();
 assert.equal(catalog.length,1);
 assert.equal(catalog[0].name.ar,'المواقع');
 assert.equal(catalog[0].plans[0].amountsMinor.setup,'50000');
 assert.equal(catalog[0].plans[0].currency,'EGP');
 const catalogQuery=fake.calls.find(call=>call.sql.includes('FROM service_categories c'));
 assert.deepEqual(catalogQuery.params,[orgId]);
 assert.match(catalogQuery.sql,/c\.organization_id = \$1/);
 assert.ok(fake.calls.every(call=>/^\s*SELECT\b/i.test(call.sql)));
 assert.equal(fake.released,1);
 await db.close();
});
test('public catalog fails closed if required catalog columns are missing',async()=>{
 const partial={service_categories:columns.service_categories,service_plans:columns.service_plans.filter(name=>name!=='annual_amount_minor')};
 const fake=fakePool({schema:schemaRows(partial)});
 const db=createDatabase(config,{poolFactory:fake.poolFactory});
 await assert.rejects(db.listPublicCatalog(),error=>error.code==='CATALOG_SCHEMA_MISMATCH');
 assert.equal(fake.calls.some(call=>call.sql.includes('FROM service_categories c')),false);
 assert.equal(fake.released,1);
 await db.close();
});
test('public catalog refuses to query without a configured organization',async()=>{
 let connected=false;
 const db=createDatabase({...config,publicOrganizationId:''},{poolFactory:()=>{connected=true;throw new Error('must not connect');}});
 await assert.rejects(db.listPublicCatalog(),error=>error.code==='CATALOG_NOT_CONFIGURED');
 assert.equal(connected,false);
 await db.close();
});

test('admin authentication fails closed when audit log schema is absent',async()=>{
 const authSchema={
  users:['id','organization_id','email','full_name','password_hash','status','last_login_at'],
  organizations:['id','status'],
  roles:['id','organization_id','name','permissions'],
  user_roles:['user_id','role_id'],
  auth_sessions:['id','user_id','token_hash','expires_at','last_seen_at','created_at']
 };
 const fake=fakePool({schema:schemaRows(authSchema)});
 const db=createDatabase(config,{poolFactory:fake.poolFactory});
 await assert.rejects(db.findAdminUser('owner@example.com'),error=>error.code==='ADMIN_SCHEMA_MISMATCH');
 assert.equal(fake.calls.length,1);
 assert.match(fake.calls[0].sql,/information_schema\.columns/);
 assert.equal(fake.released,1);
 await db.close();
});

test('admin session creation and audit event commit in one transaction',async()=>{
 const authSchema={
  users:['id','organization_id','email','full_name','password_hash','status','last_login_at','updated_at'],
  organizations:['id','status'],
  roles:['id','organization_id','name','permissions'],
  user_roles:['user_id','role_id'],
  auth_sessions:['id','user_id','token_hash','expires_at','last_seen_at','created_at'],
  audit_logs:['id','organization_id','actor_user_id','action','entity_type','entity_id','details','ip_hash','created_at']
 };
 const calls=[];
 const rows=schemaRows(authSchema);
 const client={
  async query(sql,params=[]){
   calls.push({sql,params});
   if(sql.includes('information_schema.columns'))return {rows};
   if(sql.startsWith('INSERT INTO auth_sessions'))return {rows:[{id:'session-1',expires_at:'2099-01-01T00:00:00.000Z'}]};
   if(sql.startsWith('SELECT organization_id FROM users'))return {rows:[{organization_id:orgId}]};
   return {rows:[]};
  },
  release(){}
 };
 const pool={on(){},async connect(){return client;},async end(){}};
 const db=createDatabase(config,{poolFactory:()=>pool});
 const session=await db.createAdminSession('user-1','token-hash',{ipHash:'ip-hash'});
 assert.equal(session.id,'session-1');
 assert.ok(calls.some(call=>call.sql==='BEGIN'));
 assert.ok(calls.some(call=>call.sql==='COMMIT'));
 const audit=calls.find(call=>call.sql.includes('INSERT INTO audit_logs'));
 assert.ok(audit);
 assert.equal(audit.params[0],orgId);
 assert.equal(audit.params[1],'user-1');
 assert.equal(audit.params[2],'session-1');
 assert.equal(audit.params[4],'ip-hash');
 await db.close();
});

test('admin session query groups organization status to avoid PostgreSQL 42803',async()=>{
 const authSchema={
  users:['id','organization_id','email','full_name','password_hash','status','last_login_at','updated_at'],
  organizations:['id','status'],
  roles:['id','organization_id','name','permissions'],
  user_roles:['user_id','role_id'],
  auth_sessions:['id','user_id','token_hash','expires_at','last_seen_at','created_at'],
  audit_logs:['id','organization_id','actor_user_id','action','entity_type','entity_id','details','ip_hash','created_at']
 };
 const calls=[];
 const tokenHash='session-token-hash';
 const expectedUser={id:'user-1',organization_id:orgId,email:'owner@example.com',full_name:'Owner',status:'active',organization_status:'active',expires_at:'2099-01-01T00:00:00.000Z',role_permission_sets:[['dashboard.read']]};
 const client={
  async query(sql,params=[]){
   calls.push({sql,params});
   if(sql.includes('information_schema.columns'))return {rows:schemaRows(authSchema)};
   if(sql.includes('FROM auth_sessions s'))return {rows:[expectedUser]};
   if(sql.includes('UPDATE auth_sessions SET last_seen_at'))return {rows:[]};
   throw new Error('Unexpected SQL in admin session test: '+sql);
  },
  release(){}
 };
 const pool={on(){},async connect(){return client;},async end(){}};
 const db=createDatabase(config,{poolFactory:()=>pool});
 const session=await db.getAdminSession(tokenHash);
 assert.equal(session.id,'user-1');
 const sessionQuery=calls.find(call=>call.sql.includes('FROM auth_sessions s'));
 assert.ok(sessionQuery);
 assert.match(sessionQuery.sql,/GROUP BY u\.id,\s*o\.status,\s*s\.expires_at/);
 assert.equal(sessionQuery.params[0],tokenHash);
 await db.close();
});
