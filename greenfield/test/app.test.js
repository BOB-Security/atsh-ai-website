'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {createApp}=require('../server');
async function withServer(t,config,database){const result=createApp({config,database});const server=result.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return 'http://127.0.0.1:'+server.address().port;}
const config={nodeEnv:'test',port:0,publicBaseUrl:'',databaseUrl:'',pgSsl:'disable',diagnosticsToken:''};
test('health works without database',async t=>{const base=await withServer(t,config,{checkConnection:async()=>{throw new Error('must not run');},inspectSchema:async()=>[]});const r=await fetch(base+'/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,service:'atsh-ai-greenfield'});});
test('home page serves from clean public root',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/فكرتك تستحق/);});
test('readiness reports database failure',async t=>{const base=await withServer(t,config,{checkConnection:async()=>{const e=new Error('offline');e.code='ECONNREFUSED';throw e;},inspectSchema:async()=>[]});const r=await fetch(base+'/ready');assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,database:'unavailable',code:'DATABASE_CONNECTION_FAILED'});});
test('schema diagnostics require bearer token',async t=>{const cfg={...config,diagnosticsToken:'test-only-long-secret'};const base=await withServer(t,cfg,{checkConnection:async()=>true,inspectSchema:async()=>[{table_schema:'public',table_name:'example',column_name:'id',data_type:'uuid',is_nullable:'NO'}]});assert.equal((await fetch(base+'/api/diagnostics/database-schema')).status,404);const r=await fetch(base+'/api/diagnostics/database-schema',{headers:{authorization:'Bearer test-only-long-secret'}});assert.equal(r.status,200);assert.equal((await r.json()).readOnly,true);});
test('customer portal readiness is protected and uses read-only schema inspection',async t=>{
 const cfg={...config,diagnosticsToken:'test-only-long-secret'};
 const schema=[{table_schema:'public',table_name:'customers',column_name:'id',data_type:'uuid',is_nullable:'NO'}];
 let inspections=0;
 const base=await withServer(t,cfg,{checkConnection:async()=>true,inspectSchema:async()=>{inspections++;return schema;}});
 assert.equal((await fetch(base+'/api/diagnostics/customer-portal-readiness')).status,404);
 const response=await fetch(base+'/api/diagnostics/customer-portal-readiness',{headers:{authorization:'Bearer test-only-long-secret'}});
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.ok,true);
 assert.equal(result.readOnly,true);
 assert.equal(result.ready,false);
 assert.ok(result.missingRequired.some(item=>item.table==='customer_portal_accounts'));
 assert.equal(inspections,1);
});
test('public catalog returns only database-backed catalog data',async t=>{
 const catalog=[{id:'category-1',slug:'web',name:{ar:'المواقع',en:'Web'},description:{ar:'',en:''},plans:[{id:'plan-1',slug:'web-basic',name:{ar:'أساسي',en:'Basic'},description:{ar:'',en:''},amountsMinor:{setup:'50000',monthly:'0',annual:'0'},currency:'EGP',features:['Responsive design']}]}];
 const base=await withServer(t,config,{checkConnection:async()=>true,inspectSchema:async()=>[],listPublicCatalog:async()=>catalog});
 const response=await fetch(base+'/api/public/catalog');
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.ok,true);
 assert.deepEqual(result.categories,catalog);
 assert.match(response.headers.get('cache-control'),/max-age=60/);
});
test('public catalog supplies editable provisional EGP defaults when no organization catalog exists',async t=>{
 const base=await withServer(t,config,{checkConnection:async()=>true,inspectSchema:async()=>[],listPublicCatalog:async()=>{const e=new Error('not configured');e.code='CATALOG_NOT_CONFIGURED';throw e;}});
 const response=await fetch(base+'/api/public/catalog');
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.ok,true);
 assert.equal(result.provisional,true);
 assert.ok(result.categories.some(category=>category.slug==='hosting'));
 const plans=result.categories.flatMap(category=>category.plans);
 assert.ok(plans.some(plan=>plan.slug==='landing-page'&&plan.amountsMinor.setup==='450000'));
 assert.ok(plans.some(plan=>plan.slug==='hosting-starter'&&plan.amountsMinor.monthly==='25000'));
 assert.ok(plans.every(plan=>plan.currency==='EGP'));
});
test('public catalog fails closed when organization/schema is not configured',async t=>{
 const db={checkConnection:async()=>true,inspectSchema:async()=>[],listPublicCatalog:async()=>{const e=new Error('not ready');e.code='CATALOG_SCHEMA_MISMATCH';throw e;}};
 const base=await withServer(t,config,db);
 const response=await fetch(base+'/api/public/catalog');
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'catalog_not_ready');
});
test('intake never claims an unsaved request succeeded',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});const r=await fetch(base+'/api/public/inquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test'})});assert.equal(r.status,503);assert.equal((await r.json()).error,'intake_not_enabled');});

test('home exposes the eight-step project configurator and honest submission state',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});const html=await (await fetch(base+'/')).text();assert.match(html,/id="projectWizard"/);assert.match(html,/مهيئ المشروع/);assert.doesNotMatch(html,/<form[^>]*id="inquiryForm"/);const js=await (await fetch(base+'/app.js')).text();assert.match(js,/الخطوة/);assert.match(js,/submission-disabled/);assert.match(js,/لم يتم إرسال الطلب بعد/);assert.match(js,/لن تُرسل بياناتك إلا بعد موافقتك الصريحة/);assert.doesNotMatch(js,/هذه البيانات محلية في الصفحة فقط حاليًا/);});

test('admin workspace shell is served without exposing private indexing',async t=>{
 const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});
 const response=await fetch(base+'/admin.html');
 assert.equal(response.status,200);
 const html=await response.text();
 assert.match(html,/noindex,nofollow/);
 assert.match(html,/id="adminLoginForm"/);
 assert.match(html,/id="adminDashboard"/);
 const js=await (await fetch(base+'/admin.js')).text();
 assert.match(js,/\/api\/admin\/login/);
 assert.match(js,/\/api\/admin\/overview/);
});
test('public service, pricing, about, FAQ and process pages are served',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});for(const path of ['/services.html','/pricing.html','/about.html','/faq.html','/process.html']){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.match(r.headers.get('content-type'),/text\/html/);const html=await r.text();assert.match(html,/ATSH AI/);}});
test('services page includes database-backed catalog with safe static fallback',async t=>{
 const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});
 const html=await (await fetch(base+'/services.html')).text();
 assert.match(html,/id="liveServiceCatalog"/);
 assert.match(html,/id="staticServiceCatalog"/);
 const js=await (await fetch(base+'/app.js')).text();
 assert.match(js,/fetch\('\/api\/public\/catalog'/);
 assert.match(js,/staticCatalog\.hidden=true/);
});
test('pricing page clearly labels editable starter estimates as provisional',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});const html=await (await fetch(base+'/pricing.html')).text();assert.match(html,/أسعار افتراضية مبدئية قابلة للتعديل/);assert.match(html,/ليست عرضًا ماليًا نهائيًا/);});

test('intake validates consent and reports persisted reference only after commit',async t=>{
 const cfg={...config,intakeEnabled:true,publicOrganizationId:'11111111-1111-4111-8111-111111111111'};
 let saved=0;
 const db={checkConnection:async()=>true,inspectSchema:async()=>[],createInquiry:async input=>{saved++;assert.equal(input.email,'person@example.com');return {reference:'ATSH-20261029-AB12CD34',status:'new',created_at:'2026-10-29T10:00:00.000Z'};}};
 const base=await withServer(t,cfg,db);
 const payload={name:'Test Person',email:'person@example.com',service:'موقع أو منصة',goal:'أريد إنشاء موقع تعريفي احترافي للنشاط التجاري',consent:true,features:['لوحة إدارة']};
 const denied=await fetch(base+'/api/public/inquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,consent:false})});
 assert.equal(denied.status,400);assert.equal(saved,0);
 const accepted=await fetch(base+'/api/public/inquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 assert.equal(accepted.status,201);const result=await accepted.json();assert.equal(result.inquiry.reference,'ATSH-20261029-AB12CD34');assert.equal(saved,1);
});
test('intake never claims success when persistence fails',async t=>{
 const cfg={...config,intakeEnabled:true,publicOrganizationId:'11111111-1111-4111-8111-111111111111'};
 const db={checkConnection:async()=>true,inspectSchema:async()=>[],createInquiry:async()=>{const e=new Error('schema mismatch');e.code='INTAKE_SCHEMA_MISMATCH';throw e;}};
 const base=await withServer(t,cfg,db);
 const response=await fetch(base+'/api/public/inquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test Person',email:'person@example.com',service:'موقع أو منصة',goal:'أريد إنشاء موقع تعريفي احترافي للنشاط التجاري',consent:true})});
 assert.equal(response.status,503);const result=await response.json();assert.equal(result.error,'intake_not_ready');assert.doesNotMatch(result.message,/بنجاح/);
});


test('admin overview requires an authenticated session',async t=>{
 let reads=0;
 const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[],getAdminSession:async()=>{reads++;return null;}});
 const response=await fetch(base+'/api/admin/overview');
 assert.equal(response.status,401);
 assert.equal(reads,0);
});
test('admin login uses rate-limited credentials and creates an HttpOnly session',async t=>{
 const crypto=require('node:crypto');
 const salt=crypto.randomBytes(16).toString('hex');
 const hash=crypto.scryptSync('correct horse battery staple',salt,64).toString('hex');
 let created=null;
 const admin={id:'user-1',organization_id:'org-1',email:'owner@example.com',full_name:'Owner',password_hash:JSON.stringify({salt,hash}),status:'active',organization_status:'active',role_permission_sets:[['dashboard.read','catalog.read']]};
 const db={checkConnection:async()=>true,inspectSchema:async()=>[],findAdminUser:async email=>email==='owner@example.com'?admin:null,createAdminSession:async(id,tokenHash)=>{created={id,tokenHash};return {id:'session-1'};},getAdminSession:async tokenHash=>created&&tokenHash===created.tokenHash?{...admin,expires_at:'2099-01-01T00:00:00.000Z'}:null};
 const base=await withServer(t,config,db);
 const denied=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'wrong password'})});
 assert.equal(denied.status,401);assert.equal(created,null);
 const accepted=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'correct horse battery staple'})});
 assert.equal(accepted.status,200);const result=await accepted.json();assert.equal(result.ok,true);assert.deepEqual(result.user.permissions,['dashboard.read','catalog.read']);assert.ok(created);
 const cookies=accepted.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const sessionCookie=accepted.headers.getSetCookie().find(value=>value.startsWith('atsh_admin_session='));assert.match(sessionCookie,/HttpOnly/);
 const me=await fetch(base+'/api/admin/me',{headers:{cookie:cookies}});
 assert.equal(me.status,200);assert.equal((await me.json()).user.email,'owner@example.com');
});
test('admin logout rejects a missing CSRF token',async t=>{
 const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});
 const response=await fetch(base+'/api/admin/logout',{method:'POST'});
 assert.equal(response.status,403);
 assert.equal((await response.json()).error,'csrf_validation_failed');
});


test('admin catalog is organization-scoped and permission-gated',async t=>{
 const crypto=require('node:crypto');
 const token='test-session-token-that-is-long-enough-1234567890';
 const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
 const categoryData=[{id:'cat-1',name:{ar:'المواقع'},active:true,plans:[]}];
 let requestedOrganization='';
 const db={checkConnection:async()=>true,inspectSchema:async()=>[],getAdminSession:async hash=>hash===tokenHash?{id:'user-1',organization_id:'org-verified',email:'owner@example.com',full_name:'Owner',role_permission_sets:[['catalog.read']]}:null,listAdminCatalog:async organizationId=>{requestedOrganization=organizationId;return categoryData;}};
 const base=await withServer(t,config,db);
 const anonymous=await fetch(base+'/api/admin/catalog');
 assert.equal(anonymous.status,401);
 const response=await fetch(base+'/api/admin/catalog',{headers:{cookie:'atsh_admin_session='+encodeURIComponent(token)}});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).categories,categoryData);
 assert.equal(requestedOrganization,'org-verified');
});
test('admin catalog denies a session without catalog permissions',async t=>{
 const crypto=require('node:crypto');
 const token='test-session-token-that-is-long-enough-0987654321';
 const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
 let readCount=0;
 const db={checkConnection:async()=>true,inspectSchema:async()=>[],getAdminSession:async hash=>hash===tokenHash?{id:'user-2',organization_id:'org-verified',email:'staff@example.com',full_name:'Staff',role_permission_sets:[['reports.read']]}:null,listAdminCatalog:async()=>{readCount++;return [];}};
 const base=await withServer(t,config,db);
 const response=await fetch(base+'/api/admin/catalog',{headers:{cookie:'atsh_admin_session='+encodeURIComponent(token)}});
 assert.equal(response.status,403);
 assert.equal(readCount,0);
});


test('admin leads require sales permission and use the authenticated organization',async t=>{
 const crypto=require('node:crypto');
 const token='test-admin-leads-token-1234567890-abcdef';
 const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
 let organizationUsed='';
 const sample=[{id:'lead-1',reference:'ATSH-TEST',status:'new',customer_name:'Sample',customer_email:null}];
 const db={checkConnection:async()=>true,inspectSchema:async()=>[],getAdminSession:async hash=>hash===tokenHash?{id:'user-1',organization_id:'org-a',email:'sales@example.com',full_name:'Sales',role_permission_sets:[['leads.read']]}:null,listAdminLeads:async organizationId=>{organizationUsed=organizationId;return sample;}};
 const base=await withServer(t,config,db);
 const response=await fetch(base+'/api/admin/leads',{headers:{cookie:'atsh_admin_session='+encodeURIComponent(token)}});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).leads,sample);
 assert.equal(organizationUsed,'org-a');
});
