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
