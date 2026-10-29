'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {createApp}=require('../server');
async function withServer(t,config,database){const result=createApp({config,database});const server=result.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return 'http://127.0.0.1:'+server.address().port;}
const config={nodeEnv:'test',port:0,publicBaseUrl:'',databaseUrl:'',pgSsl:'disable',diagnosticsToken:''};
test('health works without database',async t=>{const base=await withServer(t,config,{checkConnection:async()=>{throw new Error('must not run');},inspectSchema:async()=>[]});const r=await fetch(base+'/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,service:'atsh-ai-greenfield'});});
test('home page serves from clean public root',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/فكرتك تستحق/);});
test('readiness reports database failure',async t=>{const base=await withServer(t,config,{checkConnection:async()=>{const e=new Error('offline');e.code='ECONNREFUSED';throw e;},inspectSchema:async()=>[]});const r=await fetch(base+'/ready');assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,database:'unavailable',code:'DATABASE_CONNECTION_FAILED'});});
test('schema diagnostics require bearer token',async t=>{const cfg={...config,diagnosticsToken:'test-only-long-secret'};const base=await withServer(t,cfg,{checkConnection:async()=>true,inspectSchema:async()=>[{table_schema:'public',table_name:'example',column_name:'id',data_type:'uuid',is_nullable:'NO'}]});assert.equal((await fetch(base+'/api/diagnostics/database-schema')).status,404);const r=await fetch(base+'/api/diagnostics/database-schema',{headers:{authorization:'Bearer test-only-long-secret'}});assert.equal(r.status,200);assert.equal((await r.json()).readOnly,true);});
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
test('public catalog fails closed when organization/schema is not configured',async t=>{
 const db={checkConnection:async()=>true,inspectSchema:async()=>[],listPublicCatalog:async()=>{const e=new Error('not ready');e.code='CATALOG_SCHEMA_MISMATCH';throw e;}};
 const base=await withServer(t,config,db);
 const response=await fetch(base+'/api/public/catalog');
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'catalog_not_ready');
});
test('intake never claims an unsaved request succeeded',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});const r=await fetch(base+'/api/public/inquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test'})});assert.equal(r.status,503);assert.equal((await r.json()).error,'intake_not_enabled');});

test('home exposes the eight-step project configurator and honest submission state',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});const html=await (await fetch(base+'/')).text();assert.match(html,/id="projectWizard"/);assert.match(html,/مهيئ المشروع/);assert.doesNotMatch(html,/<form[^>]*id="inquiryForm"/);const js=await (await fetch(base+'/app.js')).text();assert.match(js,/الخطوة/);assert.match(js,/submission-disabled/);assert.match(js,/لم يتم إرسال الطلب بعد/);assert.match(js,/لن تُرسل بياناتك إلا بعد موافقتك الصريحة/);assert.doesNotMatch(js,/هذه البيانات محلية في الصفحة فقط حاليًا/);});

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
test('pricing page does not publish invented amounts',async t=>{const base=await withServer(t,config,{checkConnection:async()=>false,inspectSchema:async()=>[]});const html=await (await fetch(base+'/pricing.html')).text();assert.match(html,/قائمة الأسعار غير مفعّلة/);assert.match(html,/لا تُعد هذه الصفحة عرضًا ماليًا/);});

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
