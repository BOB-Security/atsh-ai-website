'use strict';
const crypto = require('node:crypto');
const { getPool } = require('./db');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEAD_TRANSITIONS = { new:['qualified','spam','lost'], qualified:['scoped','quoted','lost','spam'], scoped:['quoted','lost','spam'], quoted:['won','lost'], won:[], lost:[], spam:[] };
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function ref(prefix){return 'ATSH-'+prefix+'-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();}
function minor(value,field){if(!Number.isSafeInteger(value)||value<0||value>9000000000000)throw new Error(field+' must be a non-negative integer in minor units');return value;}
function safeText(value,field,max,required=false){const v=String(value??'').trim();if(required&&!v)throw new Error(field+' is required');if(v.length>max)throw new Error(field+' is too long');return v;}
async function organizationId(client,slug){const r=await client.query("SELECT id FROM organizations WHERE slug=$1 AND status='active' LIMIT 1",[slug]);if(!r.rowCount){const e=new Error('Organization not configured');e.code='ORGANIZATION_NOT_CONFIGURED';throw e;}return r.rows[0].id;}
async function audit(client,oid,actorId,action,type,id,details,ipHash){await client.query('INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,details,ip_hash) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)',[oid,actorId||null,action,type,id?String(id):null,JSON.stringify(details||{}),ipHash||null]);}
async function transact(config,work){const client=await getPool(config).connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}}
async function listLeads(config,{status='',search='',limit=50,offset=0}={}){
 const pool=getPool(config);const oid=(await pool.query("SELECT id FROM organizations WHERE slug=$1 AND status='active' LIMIT 1",[config.organizationSlug])).rows[0]?.id;if(!oid){const e=new Error('Organization not configured');e.code='ORGANIZATION_NOT_CONFIGURED';throw e;}
 const statuses=Object.keys(LEAD_TRANSITIONS);const s=status?String(status):null;if(s&&!statuses.includes(s))throw new Error('Invalid lead status filter');
 const q=String(search||'').trim().slice(0,120);const lim=Math.min(100,Math.max(1,Number.parseInt(limit,10)||50));const off=Math.max(0,Math.min(100000,Number.parseInt(offset,10)||0));const pattern=q?'%'+q.replace(/[\\%_]/g,'\\$&')+'%':null;
 const [rows,count]=await Promise.all([
  pool.query("SELECT l.id,l.reference,l.status,l.source,l.project_goal,l.solution_type,l.created_at,l.updated_at,c.id AS customer_id,c.display_name AS customer_name,c.email AS customer_email,c.phone AS customer_phone FROM leads l LEFT JOIN customers c ON c.id=l.customer_id AND c.organization_id=l.organization_id WHERE l.organization_id=$1 AND ($2::text IS NULL OR l.status=$2) AND ($3::text IS NULL OR l.reference ILIKE $3 OR l.project_goal ILIKE $3 OR c.display_name ILIKE $3 OR c.email ILIKE $3) ORDER BY l.created_at DESC LIMIT $4 OFFSET $5",[oid,s,pattern,lim,off]),
  pool.query("SELECT count(*)::integer AS count FROM leads l LEFT JOIN customers c ON c.id=l.customer_id AND c.organization_id=l.organization_id WHERE l.organization_id=$1 AND ($2::text IS NULL OR l.status=$2) AND ($3::text IS NULL OR l.reference ILIKE $3 OR l.project_goal ILIKE $3 OR c.display_name ILIKE $3 OR c.email ILIKE $3)",[oid,s,pattern])
 ]);
 return {items:rows.rows,total:count.rows[0].count,limit:lim,offset:off,allowedStatuses:statuses};
}
async function updateLead(config,actor,id,input,ipHash){
 if(!UUID.test(String(id)))throw new Error('Invalid lead id');
 return transact(config,async client=>{
  const oid=await organizationId(client,config.organizationSlug);const current=await client.query('SELECT * FROM leads WHERE organization_id=$1 AND id=$2 FOR UPDATE',[oid,id]);if(!current.rowCount){const e=new Error('Lead not found');e.code='NOT_FOUND';throw e;}const lead=current.rows[0];
  const nextStatus=input.status===undefined?lead.status:String(input.status);if(!Object.prototype.hasOwnProperty.call(LEAD_TRANSITIONS,nextStatus))throw new Error('Invalid lead status');
  if(nextStatus!==lead.status&&!LEAD_TRANSITIONS[lead.status]?.includes(nextStatus)){const e=new Error('Invalid lead status transition');e.code='INVALID_TRANSITION';throw e;}
  if(nextStatus==='quoted'){const issued=await client.query("SELECT id FROM quotes WHERE organization_id=$1 AND lead_id=$2 AND status='issued' LIMIT 1",[oid,id]);if(!issued.rowCount){const e=new Error('Issue a quote before moving this lead to quoted');e.code='QUOTE_REQUIRED';throw e;}}
  let assigned=lead.assigned_user_id;if(input.assigned_user_id!==undefined){if(input.assigned_user_id===null||input.assigned_user_id==='')assigned=null;else{if(!UUID.test(String(input.assigned_user_id)))throw new Error('Invalid assigned user id');const user=await client.query("SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND status='active'",[input.assigned_user_id,oid]);if(!user.rowCount)throw new Error('Assigned user must be active in this organization');assigned=user.rows[0].id;}}
  const result=await client.query('UPDATE leads SET status=$3,assigned_user_id=$4,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING id,reference,status,source,project_goal,solution_type,assigned_user_id,created_at,updated_at',[oid,id,nextStatus,assigned]);
  await audit(client,oid,actor.id,'lead.updated','lead',id,{from:lead.status,to:nextStatus,assigned_user_id:assigned},ipHash);return result.rows[0];
 });
}
function normalizeQuoteItems(input){
 if(!Array.isArray(input)||input.length<1||input.length>50)throw new Error('Quote must contain between 1 and 50 line items');
 let setupTotal=0,monthlyTotal=0,annualTotal=0;
 const items=input.map((item,index)=>{
  const description=safeText(item.description,'item description',240,true);const quantity=item.quantity===undefined?1:item.quantity;if(!Number.isInteger(quantity)||quantity<1||quantity>100)throw new Error('Item quantity must be an integer from 1 to 100');
  const unitSetup=minor(item.unit_setup_minor??0,'unit_setup_minor'),unitMonthly=minor(item.unit_monthly_minor??0,'unit_monthly_minor'),unitAnnual=minor(item.unit_annual_minor??0,'unit_annual_minor');
  const setup=unitSetup*quantity,monthly=unitMonthly*quantity,annual=unitAnnual*quantity;if(!Number.isSafeInteger(setup)||!Number.isSafeInteger(monthly)||!Number.isSafeInteger(annual))throw new Error('Quote line total exceeds supported range');
  setupTotal+=setup;monthlyTotal+=monthly;annualTotal+=annual;if(!Number.isSafeInteger(setupTotal)||!Number.isSafeInteger(monthlyTotal)||!Number.isSafeInteger(annualTotal))throw new Error('Quote total exceeds supported range');
  return {description,quantity,unit_setup_minor:unitSetup,unit_monthly_minor:unitMonthly,unit_annual_minor:unitAnnual,setup_total_minor:setup,monthly_total_minor:monthly,annual_total_minor:annual};
 });
 if(setupTotal+monthlyTotal+annualTotal<=0)throw new Error('A quote must include a non-zero amount; do not issue a zero-price quote accidentally');
 return {items,setupTotal,monthlyTotal,annualTotal};
}
async function createQuote(config,actor,input,ipHash){
 const leadId=input.lead_id||null,customerInput=input.customer_id||null;if(!leadId&&!customerInput)throw new Error('lead_id or customer_id is required');if(leadId&&!UUID.test(String(leadId)))throw new Error('Invalid lead id');if(customerInput&&!UUID.test(String(customerInput)))throw new Error('Invalid customer id');
 const currency=safeText(input.currency||'EGP','currency',3,true).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new Error('currency must be a three-letter code');
 const items=normalizeQuoteItems(input.items);const note=safeText(input.customer_note,'customer_note',2000);
 let validUntil=null;if(input.valid_until){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(input.valid_until))||Number.isNaN(Date.parse(input.valid_until))||new Date(input.valid_until+'T23:59:59Z')<=new Date())throw new Error('valid_until must be a future YYYY-MM-DD date');validUntil=input.valid_until;}
 return transact(config,async client=>{
  const oid=await organizationId(client,config.organizationSlug);let customerId=customerInput;
  if(leadId){const lead=await client.query('SELECT id,customer_id,status FROM leads WHERE organization_id=$1 AND id=$2 FOR UPDATE',[oid,leadId]);if(!lead.rowCount){const e=new Error('Lead not found');e.code='NOT_FOUND';throw e;}if(customerId&&String(lead.rows[0].customer_id)!==String(customerId))throw new Error('Customer does not match the selected lead');customerId=lead.rows[0].customer_id;if(!customerId)throw new Error('Lead has no customer record');}
  const customer=await client.query('SELECT id FROM customers WHERE organization_id=$1 AND id=$2',[oid,customerId]);if(!customer.rowCount){const e=new Error('Customer not found');e.code='NOT_FOUND';throw e;}
  const reference=ref('Q');const snapshot={version:1,currency,items:items.items,setup_total_minor:items.setupTotal,monthly_total_minor:items.monthlyTotal,annual_total_minor:items.annualTotal,customer_note:note,pricing_source:'manual_admin_quote',created_at:new Date().toISOString()};
  const result=await client.query("INSERT INTO quotes (organization_id,customer_id,lead_id,reference,status,currency,snapshot,setup_total_minor,monthly_total_minor,annual_total_minor,valid_until,created_by) VALUES ($1,$2,$3,$4,'draft',$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING id,reference,status,currency,setup_total_minor,monthly_total_minor,annual_total_minor,valid_until,created_at",[oid,customerId,leadId,reference,currency,JSON.stringify(snapshot),items.setupTotal,items.monthlyTotal,items.annualTotal,validUntil,actor.id]);
  await audit(client,oid,actor.id,'quote.created','quote',result.rows[0].id,{reference,currency,setup_total_minor:items.setupTotal,monthly_total_minor:items.monthlyTotal,annual_total_minor:items.annualTotal,lead_id:leadId},ipHash);return result.rows[0];
 });
}
async function listQuotes(config,{status='',limit=50,offset=0}={}){
 const pool=getPool(config);const oid=(await pool.query("SELECT id FROM organizations WHERE slug=$1 AND status='active' LIMIT 1",[config.organizationSlug])).rows[0]?.id;if(!oid){const e=new Error('Organization not configured');e.code='ORGANIZATION_NOT_CONFIGURED';throw e;}
 const allowed=['draft','issued','accepted','rejected','expired','cancelled'];const s=status?String(status):null;if(s&&!allowed.includes(s))throw new Error('Invalid quote status');const lim=Math.min(100,Math.max(1,Number.parseInt(limit,10)||50));const off=Math.max(0,Math.min(100000,Number.parseInt(offset,10)||0));
 const [rows,count]=await Promise.all([pool.query("SELECT q.id,q.reference,q.status,q.currency,q.setup_total_minor,q.monthly_total_minor,q.annual_total_minor,q.valid_until,q.issued_at,q.accepted_at,q.created_at,c.display_name AS customer_name,c.email AS customer_email,l.reference AS lead_reference FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id AND c.organization_id=q.organization_id LEFT JOIN leads l ON l.id=q.lead_id AND l.organization_id=q.organization_id WHERE q.organization_id=$1 AND ($2::text IS NULL OR q.status=$2) ORDER BY q.created_at DESC LIMIT $3 OFFSET $4",[oid,s,lim,off]),pool.query("SELECT count(*)::integer AS count FROM quotes WHERE organization_id=$1 AND ($2::text IS NULL OR status=$2)",[oid,s])]);
 return {items:rows.rows,total:count.rows[0].count,limit:lim,offset:off,allowedStatuses:allowed};
}
async function issueQuote(config,actor,id,ipHash){
 if(!UUID.test(String(id)))throw new Error('Invalid quote id');
 return transact(config,async client=>{
  const oid=await organizationId(client,config.organizationSlug);const current=await client.query('SELECT * FROM quotes WHERE organization_id=$1 AND id=$2 FOR UPDATE',[oid,id]);if(!current.rowCount){const e=new Error('Quote not found');e.code='NOT_FOUND';throw e;}const quote=current.rows[0];if(quote.status!=='draft'){const e=new Error('Only draft quotes can be issued');e.code='INVALID_TRANSITION';throw e;}
  if(quote.lead_id){const lead=await client.query('SELECT status FROM leads WHERE organization_id=$1 AND id=$2 FOR UPDATE',[oid,quote.lead_id]);if(lead.rowCount&&!['qualified','scoped','quoted'].includes(lead.rows[0].status)){const e=new Error('Qualify and scope the lead before issuing a quote');e.code='LEAD_NOT_READY';throw e;}}
  const token=crypto.randomBytes(32).toString('base64url');const tokenHash=sha256(token);
  const result=await client.query("UPDATE quotes SET status='issued',issued_at=NOW(),valid_until=COALESCE(valid_until,CURRENT_DATE+14),response_token_hash=$3,response_token_expires_at=NOW()+INTERVAL '14 days',updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING id,reference,status,valid_until,currency,setup_total_minor,monthly_total_minor,annual_total_minor,lead_id",[oid,id,tokenHash]);
  if(quote.lead_id)await client.query("UPDATE leads SET status='quoted',updated_at=NOW() WHERE organization_id=$1 AND id=$2 AND status IN ('qualified','scoped')",[oid,quote.lead_id]);
  await audit(client,oid,actor.id,'quote.issued','quote',id,{reference:quote.reference,expires_in_days:14},ipHash);
  return {quote:result.rows[0],token,url:config.publicBaseUrl.replace(/\/$/,'')+'/quote-response.html?token='+encodeURIComponent(token)};
 });
}
async function getPublicQuote(config,token){
 if(typeof token!=='string'||token.length<20||token.length>120)return null;const pool=getPool(config);const result=await pool.query("SELECT id,reference,status,currency,snapshot,setup_total_minor,monthly_total_minor,annual_total_minor,valid_until,response_token_expires_at FROM quotes WHERE response_token_hash=$1 AND status='issued' AND response_token_expires_at>NOW() LIMIT 1",[sha256(token)]);
 if(!result.rowCount)return null;const quote=result.rows[0];if(quote.valid_until&&new Date(quote.valid_until+'T23:59:59Z')<new Date())return {expired:true,reference:quote.reference};return {reference:quote.reference,status:quote.status,currency:String(quote.currency).trim(),snapshot:quote.snapshot,setup_total_minor:quote.setup_total_minor,monthly_total_minor:quote.monthly_total_minor,annual_total_minor:quote.annual_total_minor,valid_until:quote.valid_until};
}
async function respondToQuote(config,token,decision){
 if(!['accepted','rejected'].includes(decision))throw new Error('Decision must be accepted or rejected');if(typeof token!=='string'||token.length<20||token.length>120){const e=new Error('Invalid quote token');e.code='NOT_FOUND';throw e;}
 return transact(config,async client=>{
  const oid=await organizationId(client,config.organizationSlug);const current=await client.query("SELECT * FROM quotes WHERE organization_id=$1 AND response_token_hash=$2 AND status='issued' AND response_token_expires_at>NOW() FOR UPDATE",[oid,sha256(token)]);if(!current.rowCount){const e=new Error('Quote response token is invalid or expired');e.code='NOT_FOUND';throw e;}const quote=current.rows[0];
  if(quote.valid_until&&new Date(quote.valid_until+'T23:59:59Z')<new Date()){await client.query("UPDATE quotes SET status='expired',response_token_hash=NULL,response_token_expires_at=NULL,updated_at=NOW() WHERE id=$1",[quote.id]);await audit(client,oid,null,'quote.expired','quote',quote.id,{reference:quote.reference},null);return {expired:true,reference:quote.reference};}
  const result=await client.query("UPDATE quotes SET status=$3,accepted_at=CASE WHEN $3='accepted' THEN NOW() ELSE accepted_at END,response_token_hash=NULL,response_token_expires_at=NULL,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING reference,status",[oid,quote.id,decision]);
  if(decision==='accepted'&&quote.lead_id)await client.query("UPDATE leads SET status='won',updated_at=NOW() WHERE organization_id=$1 AND id=$2 AND status='quoted'",[oid,quote.lead_id]);
  await audit(client,oid,null,'quote.customer_response','quote',quote.id,{reference:quote.reference,decision},null);return result.rows[0];
 });
}
module.exports={listLeads,updateLead,createQuote,listQuotes,issueQuote,getPublicQuote,respondToQuote};
