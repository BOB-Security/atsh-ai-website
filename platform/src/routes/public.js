'use strict';
const express = require('express');
const { z } = require('zod');
const { getPool } = require('../db');
const router = express.Router();

router.get('/site-content',async(req,res,next)=>{try{const org=req.app.locals.organizationId;const [settings,pages]=await Promise.all([getPool().query('SELECT settings,updated_at FROM site_settings WHERE organization_id=$1',[org]),getPool().query('SELECT slug,title_ar,title_en,body_ar,body_en,sort_order FROM site_pages WHERE organization_id=$1 AND visible ORDER BY sort_order,slug',[org])]);res.json({settings:settings.rows[0]?.settings||{},pages:pages.rows});}catch(e){next(e);}});
router.get('/services', async (req, res, next) => {
  try {
    const org = req.app.locals.organizationId;
    const { rows } = await getPool().query(
      `SELECT c.slug AS category, c.name_ar AS category_ar, c.name_en AS category_en,
              p.id, p.slug, p.name_ar, p.name_en, p.description_ar, p.description_en,
              p.setup_amount_minor, p.monthly_amount_minor, p.annual_amount_minor, p.currency,
              p.features
       FROM service_categories c JOIN service_plans p ON p.category_id = c.id
       WHERE c.organization_id = $1 AND p.organization_id = $1 AND c.active AND p.active
       ORDER BY c.sort_order, p.sort_order`, [org]);
    res.json({ services: rows });
  } catch (err) { next(err); }
});

router.post('/quote-response',async(req,res,next)=>{try{const s=z.object({token:z.string().min(30).max(200),decision:z.enum(['accepted','rejected'])}).strict().parse(req.body);const hash=require('node:crypto').createHash('sha256').update(s.token).digest('hex');const {rows}=await getPool().query("UPDATE quotes SET status=$2,response_token_hash=NULL,response_token_expires_at=NULL,accepted_at=CASE WHEN $2='accepted' THEN now() ELSE accepted_at END,updated_at=now() WHERE response_token_hash=$1 AND response_token_expires_at>now() AND status='issued' AND (valid_until IS NULL OR valid_until>=current_date) RETURNING reference,status",[hash,s.decision]);if(!rows[0])return res.status(400).json({error:'رابط العرض غير صالح أو انتهت صلاحيته.'});res.json({ok:true,reference:rows[0].reference,decision:rows[0].status});}catch(e){if(e.name==='ZodError')return res.status(400).json({error:'بيانات الرد غير صالحة.'});next(e);}});
router.post('/project-approvals/confirm',async(req,res,next)=>{try{
 const s=z.object({token:z.string().min(30).max(200),decision:z.enum(['approved','rejected']),note:z.string().max(2000).optional().default('')}).strict().parse(req.body);
 const hash=require('node:crypto').createHash('sha256').update(s.token).digest('hex'),client=await getPool().connect();
 try{await client.query('BEGIN');const {rows}=await client.query("SELECT a.id,a.project_id,a.approval_type,p.reference FROM project_approvals a JOIN projects p ON p.id=a.project_id WHERE a.approval_token_hash=$1 AND a.status='requested' AND a.token_expires_at>now() FOR UPDATE",[hash]);const approval=rows[0];if(!approval){await client.query('ROLLBACK');return res.status(400).json({error:'رابط الموافقة غير صالح أو انتهت صلاحيته.'});}await client.query("UPDATE project_approvals SET status=$2,approved_at=CASE WHEN $2='approved' THEN now() ELSE NULL END,note=CASE WHEN $3='' THEN note ELSE note || E'\\n' || $3 END,approval_token_hash=NULL,token_expires_at=NULL WHERE id=$1",[approval.id,s.decision,s.note]);if(approval.approval_type==='final_release'&&s.decision==='approved')await client.query("UPDATE projects SET status='client_approved',client_approved_at=now(),updated_at=now() WHERE id=$1",[approval.project_id]);await client.query('COMMIT');res.json({ok:true,reference:approval.reference,decision:s.decision});}
 catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }catch(e){if(e.name==='ZodError')return res.status(400).json({error:'بيانات الموافقة غير صالحة.'});next(e);}});
router.get('/pricing',async(req,res,next)=>{try{const org=req.app.locals.organizationId;const [categories,plans,addons]=await Promise.all([getPool().query('SELECT id,slug,name_ar,name_en,description_ar,description_en FROM service_categories WHERE organization_id=$1 AND active ORDER BY sort_order',[org]),getPool().query('SELECT id,category_id,slug,name_ar,name_en,description_ar,description_en,setup_amount_minor,monthly_amount_minor,annual_amount_minor,currency,features FROM service_plans WHERE organization_id=$1 AND active ORDER BY sort_order',[org]),getPool().query('SELECT id,slug,name_ar,name_en,description_ar,description_en,setup_amount_minor,monthly_amount_minor,annual_amount_minor,currency FROM service_addons WHERE organization_id=$1 AND active ORDER BY name_ar',[org])]);res.json({categories:categories.rows,plans:plans.rows,addons:addons.rows,notice:req.query.locale==='en'?'Estimates are indicative and require scope review and a formal approved quote.':'الأسعار تقديرية وتخضع لمراجعة النطاق واعتماد عرض رسمي.'});}catch(e){next(e);}});
router.post('/pricing/estimate',async(req,res,next)=>{const s=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254),phone:z.string().trim().max(40).optional().default(''),planId:z.string().uuid(),addonIds:z.array(z.string().uuid()).max(30).default([]),notes:z.string().max(2000).optional().default(''),consent:z.literal(true),locale:z.enum(['ar','en']).default('ar')}).strict().parse(req.body);const client=await getPool().connect();try{await client.query('BEGIN');const org=req.app.locals.organizationId;const plan=(await client.query('SELECT p.*,c.name_ar category_name FROM service_plans p JOIN service_categories c ON c.id=p.category_id WHERE p.id=$1 AND p.organization_id=$2 AND p.active AND c.active',[s.planId,org])).rows[0];if(!plan){await client.query('ROLLBACK');return res.status(400).json({error:'الباقة المختارة غير متاحة.'});}const addons=s.addonIds.length?(await client.query('SELECT * FROM service_addons WHERE organization_id=$1 AND active AND id=ANY($2::uuid[])',[org,s.addonIds])).rows:[];if(addons.length!==new Set(s.addonIds).size){await client.query('ROLLBACK');return res.status(400).json({error:'إحدى الإضافات غير متاحة.'});}if(addons.some(a=>a.currency!==plan.currency)){await client.query('ROLLBACK');return res.status(400).json({error:'يجب أن تكون العملة موحدة بين الباقة والإضافات.'});}let customer=(await client.query('SELECT id FROM customers WHERE organization_id=$1 AND lower(email)=lower($2) LIMIT 1',[org,s.email])).rows[0];if(!customer)customer=(await client.query("INSERT INTO customers(organization_id,display_name,email,phone,preferred_locale,status,source) VALUES($1,$2,$3,$4,$5,'lead','pricing') RETURNING id",[org,s.name,s.email,s.phone,s.locale])).rows[0];const leadRef='ATS-'+require('node:crypto').randomBytes(4).toString('hex').toUpperCase();const lead=(await client.query("INSERT INTO leads(organization_id,customer_id,reference,status,source,project_goal,solution_type,brief,consent_at) VALUES($1,$2,$3,'qualified','pricing',$4,'custom_system',$5::jsonb,now()) RETURNING id",[org,customer.id,leadRef,s.notes||'طلب تقدير سعر من كتالوج الخدمات',JSON.stringify({planId:plan.id,addonIds:s.addonIds,locale:s.locale})])).rows[0];const setup=BigInt(plan.setup_amount_minor)+addons.reduce((n,a)=>n+BigInt(a.setup_amount_minor),0n),monthly=BigInt(plan.monthly_amount_minor)+addons.reduce((n,a)=>n+BigInt(a.monthly_amount_minor),0n),annual=BigInt(plan.annual_amount_minor)+addons.reduce((n,a)=>n+BigInt(a.annual_amount_minor),0n);const reference='EST-'+require('node:crypto').randomBytes(4).toString('hex').toUpperCase();const snapshot={customer:{name:s.name,email:s.email,phone:s.phone},plan,addons,notes:s.notes,estimateOnly:true,createdAt:new Date().toISOString(),notice:'تقدير غير ملزم؛ يتطلب مراجعة النطاق وإصدار عرض رسمي.'};const quote=(await client.query("INSERT INTO quotes(organization_id,customer_id,lead_id,reference,status,currency,snapshot,setup_total_minor,monthly_total_minor,annual_total_minor) VALUES($1,$2,$3,$4,'draft',$5,$6::jsonb,$7,$8,$9) RETURNING id,reference,status,currency,setup_total_minor,monthly_total_minor,annual_total_minor,created_at",[org,customer.id,lead.id,reference,plan.currency,JSON.stringify(snapshot),setup.toString(),monthly.toString(),annual.toString()])).rows[0];const items=[{type:'plan',id:plan.id,name:plan.name_ar,setup:plan.setup_amount_minor,monthly:plan.monthly_amount_minor,annual:plan.annual_amount_minor,snapshot:plan},...addons.map(a=>({type:'addon',id:a.id,name:a.name_ar,setup:a.setup_amount_minor,monthly:a.monthly_amount_minor,annual:a.annual_amount_minor,snapshot:a}))];for(const item of items)await client.query('INSERT INTO quote_items(quote_id,item_type,catalog_item_id,description,quantity,setup_amount_minor,monthly_amount_minor,annual_amount_minor,snapshot) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8::jsonb)',[quote.id,item.type,item.id,item.name,item.setup,item.monthly,item.annual,JSON.stringify(item.snapshot)]);await client.query("INSERT INTO notifications(organization_id,user_id,kind,title,body) SELECT $1,u.id,'quote.estimate',$2,$3 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.organization_id=$1 AND u.status='active' AND r.name IN ('Owner','Administrator','Finance')",[org,'طلب تقدير سعر '+reference,s.name+' · '+s.email]);await client.query('COMMIT');res.status(201).json({ok:true,reference:leadRef,estimate:quote,notice:s.locale==='ar'?'هذا تقدير أولي وليس عرضًا رسميًا.':'This is an initial estimate, not a formal quote.'});}catch(e){await client.query('ROLLBACK');if(e.name==='ZodError')return res.status(400).json({error:'راجع البيانات والموافقة المطلوبة.'});next(e);}finally{client.release();}});
router.post('/support-tickets',async(req,res,next)=>{try{const s=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254),phone:z.string().trim().max(40).optional().default(''),subject:z.string().trim().min(3).max(200),description:z.string().trim().min(5).max(10000),consent:z.literal(true),locale:z.enum(['ar','en']).default('ar')}).strict().parse(req.body);const db=getPool(),org=req.app.locals.organizationId,client=await db.connect();try{await client.query('BEGIN');let customer=(await client.query('SELECT id FROM customers WHERE organization_id=$1 AND lower(email)=lower($2) LIMIT 1',[org,s.email])).rows[0];if(!customer)customer=(await client.query("INSERT INTO customers(organization_id,display_name,email,phone,preferred_locale,status,source) VALUES($1,$2,$3,$4,$5,'active','support') RETURNING id",[org,s.name,s.email,s.phone,s.locale])).rows[0];const reference='TKT-'+require('node:crypto').randomBytes(4).toString('hex').toUpperCase();const ticket=(await client.query("INSERT INTO support_tickets(organization_id,customer_id,reference,subject,description,status,priority) VALUES($1,$2,$3,$4,$5,'open','normal') RETURNING reference,created_at",[org,customer.id,reference,s.subject,s.description])).rows[0];await client.query("INSERT INTO notifications(organization_id,user_id,kind,title,body) SELECT $1,u.id,'support.new',$2,$3 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.organization_id=$1 AND u.status='active' AND r.name IN ('Owner','Administrator','Support')",[org,'طلب دعم جديد '+ticket.reference,s.subject]);await client.query('COMMIT');res.status(201).json({ok:true,reference:ticket.reference,receivedAt:ticket.created_at});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}catch(e){if(e.name==='ZodError')return res.status(400).json({error:'راجع بيانات طلب الدعم والموافقة المطلوبة.'});next(e);}});
const intakeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional().default(''),
  locale: z.enum(['ar','en']).default('ar'),
  goal: z.string().trim().min(5).max(1000),
  solutionType: z.enum(['website','ecommerce','web_app','mobile_app','custom_system','automation','ai_assistant','integration','unsure']),
  brief: z.record(z.string(), z.unknown()).default({}),
  consent: z.literal(true)
});
router.post('/project-inquiries', async (req, res, next) => {
  try {
    const input = intakeSchema.parse(req.body);
    const db = getPool();
    const org = req.app.locals.organizationId;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id FROM customers WHERE organization_id=$1 AND lower(email)=lower($2) LIMIT 1',
        [org, input.email]);
      let customerId = existing.rows[0]?.id;
      if (!customerId) {
        const inserted = await client.query(
          `INSERT INTO customers (organization_id,display_name,email,phone,preferred_locale,status,source)
           VALUES ($1,$2,$3,$4,$5,'lead','website') RETURNING id`,
          [org,input.name,input.email,input.phone,input.locale]);
        customerId = inserted.rows[0].id;
      }
      const reference = 'ATS-' + require('node:crypto').randomBytes(4).toString('hex').toUpperCase();
      const lead = await client.query(
        `INSERT INTO leads (organization_id,customer_id,reference,status,source,project_goal,solution_type,brief,consent_at)
         VALUES ($1,$2,$3,'new','website',$4,$5,$6::jsonb,now()) RETURNING id,reference,created_at`,
        [org,customerId,reference,input.goal,input.solutionType,JSON.stringify(input.brief)]);
      await client.query("INSERT INTO notifications(organization_id,user_id,kind,title,body) SELECT $1,u.id,'lead.new',$2,$3 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.organization_id=$1 AND u.status='active' AND r.name IN ('Owner','Administrator')",[org,'طلب مشروع جديد '+lead.rows[0].reference,input.name+' · '+input.solutionType]);
      await client.query('COMMIT');
      res.status(201).json({ ok: true, reference: lead.rows[0].reference, receivedAt: lead.rows[0].created_at });
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: 'راجع بيانات الطلب ثم حاول مرة أخرى.', issues: err.issues.map(i => ({path:i.path,message:i.message})) });
    next(err);
  }
});
module.exports = router;
