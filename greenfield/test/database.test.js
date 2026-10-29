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
