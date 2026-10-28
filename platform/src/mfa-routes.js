'use strict';
const express = require('express');
const { z } = require('zod');
const { getPool } = require('./db');
const { requireAuth, verifyPassword, verifyMfaLogin } = require('./auth');
const mfa = require('./mfa');
const router = express.Router();

router.post('/auth/mfa/verify', verifyMfaLogin);
router.use('/auth/mfa', requireAuth);

router.get('/auth/mfa/status', async (req,res,next) => {
  try {
    const result = await getPool().query('SELECT enabled FROM user_mfa WHERE user_id=$1',[req.user.id]);
    res.json({enabled:Boolean(result.rows[0]?.enabled)});
  } catch (err) { next(err); }
});

router.post('/auth/mfa/setup', async (req,res,next) => {
  try {
    const input = z.object({password:z.string().min(1).max(256)}).strict().parse(req.body);
    const result = await getPool().query('SELECT password_hash FROM users WHERE id=$1 AND organization_id=$2',[req.user.id,req.app.locals.organizationId]);
    if (!result.rows[0] || !await verifyPassword(input.password,result.rows[0].password_hash)) return res.status(401).json({error:'كلمة المرور غير صحيحة.'});
    const existing = await getPool().query('SELECT enabled FROM user_mfa WHERE user_id=$1',[req.user.id]);
    if (existing.rows[0]?.enabled) return res.status(409).json({error:'التحقق بخطوتين مفعّل بالفعل.'});
    const secret = mfa.generateSecret();
    const ciphertext = mfa.encryptSecret(secret);
    await getPool().query('INSERT INTO user_mfa(user_id,secret_ciphertext,enabled,last_totp_step) VALUES($1,$2,false,-1) ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,enabled=false,last_totp_step=-1,updated_at=now() WHERE user_mfa.enabled=false',[req.user.id,ciphertext]);
    const issuer = 'ATSH%20AI';
    const account = encodeURIComponent(req.user.email);
    res.json({ok:true,secret,otpauthUrl:'otpauth://totp/'+issuer+':'+account+'?secret='+secret+'&issuer='+issuer+'&algorithm=SHA1&digits=6&period=30'});
  } catch (err) { if (err.name==='ZodError') return res.status(400).json({error:'أدخل كلمة المرور الحالية.'}); if (/MFA_ENCRYPTION_KEY/.test(err.message)) return res.status(503).json({error:'إعداد مفتاح تشفير MFA غير مكتمل.'}); next(err); }
});

router.post('/auth/mfa/enable', async (req,res,next) => {
  try {
    const input = z.object({code:z.string().trim().regex(/^\d{6}$/)}).strict().parse(req.body);
    const result = await getPool().query('SELECT secret_ciphertext FROM user_mfa WHERE user_id=$1 AND enabled=false',[req.user.id]);
    if (!result.rows[0]) return res.status(409).json({error:'ابدأ إعداد MFA أولًا.'});
    const secret = mfa.decryptSecret(result.rows[0].secret_ciphertext);
    const step = mfa.verifyTotp(secret,input.code);
    if (step===null) return res.status(400).json({error:'رمز التحقق غير صحيح.'});
    const codes = mfa.recoveryCodes();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const enabled = await client.query('UPDATE user_mfa SET enabled=true,last_totp_step=$2,updated_at=now() WHERE user_id=$1 AND enabled=false',[req.user.id,step]);
      if (!enabled.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({error:'تغير إعداد MFA. حدّث الصفحة.'}); }
      await client.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1',[req.user.id]);
      for (const code of codes) await client.query('INSERT INTO user_mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',[req.user.id,mfa.hashRecovery(code)]);
      await client.query("INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) SELECT organization_id,$2,'auth.mfa_enabled','user',$2,'{}'::jsonb FROM users WHERE id=$2",[req.user.id]);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK').catch(()=>{}); throw err; }
    finally { client.release(); }
    res.json({ok:true,recoveryCodes:codes});
  } catch (err) { if (err.name==='ZodError') return res.status(400).json({error:'أدخل رمزًا مكونًا من 6 أرقام.'}); if (/MFA_ENCRYPTION_KEY/.test(err.message)) return res.status(503).json({error:'إعداد مفتاح تشفير MFA غير مكتمل.'}); next(err); }
});
module.exports = router;
