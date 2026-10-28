'use strict';
const crypto=require('node:crypto');
const express=require('express');
const {z}=require('zod');
const {getPool}=require('./db');
const {requireAuth,verifyPassword,verifyMfaLogin}=require('./auth');
const mfa=require('./mfa');
const router=express.Router();
router.post('/auth/mfa/verify',verifyMfaLogin);
router.use('/auth/mfa',requireAuth);
router.get('/auth/mfa/status',async(req,res,next)=>{try{const r=await getPool().query('SELECT enabled FROM user_mfa WHERE user_id=$1',[req.user.id]);res.json({enabled:Boolean(r.rows[0]?.enabled)});}catch(e){next(e);}});
router.post('/auth/mfa/setup',async(req,res,next)=>{try{const s=z.object({password:z.string().min(1).max(256)}).strict().parse(req.body);const u=await getPool().query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);if(!u.rows[0]||!await verifyPassword(s.password,u.rows[0].password_hash))return res.status(401).json({error:'كلمة المرور غير صحيحة.'});let secret;try{secret=mfa.generateSecret();const cipher=mfa.encryptSecret(secret);const saved=await getPool().query(`INSERT INTO user_mfa(user_id,secret_ciphertext,enabled,last_totp_step,pending_expires_at) VALUES($1,$2,false,-1,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,enabled=false,last_totp_step=-1,pending_expires_at=now()+interval '10 minutes',updated_at=now() WHERE user_mfa.enabled=false AND (user_mfa.pending_expires_at IS NULL OR user_mfa.pending_expires_at<=now()) RETURNING user_id`,[req.user.id,cipher]);if(!saved.rowCount)return res.status(409).json({error:'إعداد MFA مفعّل بالفعل أو توجد عملية إعداد غير منتهية.'});}catch(e){if(/MFA_ENCRYPTION_KEY/.test(e.message))return res.status(503).json({error:'إعداد مفتاح تشفير MFA غير مكتمل في بيئة التشغيل.'});throw e;}const issuer='ATSH%20AI',account=encodeURIComponent(req.user.email);res.json({ok:true,secret,otpauthUrl:'otpauth://totp/'+issuer+':'+account+'?secret='+secret+'&issuer='+issuer+'&algorithm=SHA1&digits=6&period=30'});}catch(e){if(e.name==='ZodError')return res.status(400).json({error:'أدخل كلمة المرور الحالية.'});next(e);}});
router.post('/auth/mfa/enable',async(req,res,next)=>{try{const s=z.object({code:z.string().trim().regex(/^\d{6}$/)}).strict().parse(req.body);const r=await getPool().query('SELECT secret_ciphertext FROM user_mfa WHERE user_id=$1 AND enabled=false AND pending_expires_at>now()',[req.user.id]);if(!r.rows[0])return res.status(409).json({error:'ابدأ إعداد MFA أولًا.'});let secret;try{secret=mfa.decryptSecret(r.rows[0].secret_ciphertext);}catch(e){return res.status(503).json({error:'تعذر فك تشفير إعداد MFA. تحقق من مفتاح البيئة.'});}const step=mfa.verifyTotp(secret,s.code);if(step===null)return res.status(400).json({error:'رمز التحقق غير صحيح.'});const codes=mfa.recoveryCodes(),client=await getPool().connect();try{await client.query('BEGIN');const changed=await client.query('UPDATE user_mfa SET enabled=true,last_totp_step=$2,pending_expires_at=NULL,updated_at=now() WHERE user_id=$1 AND enabled=false AND pending_expires_at>now() AND secret_ciphertext=$3',[req.user.id,step,r.rows[0].secret_ciphertext]);if(!changed.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'إعداد MFA تغير بالفعل. حدّث الصفحة.'});}await client.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1',[req.user.id]);for(const code of codes)await client.query('INSERT INTO user_mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',[req.user.id,mfa.hashRecovery(code)]);await client.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) SELECT organization_id,$1,'auth.mfa_enabled','user',$2,'{}'::jsonb FROM users WHERE id=$3`,[req.user.id,String(req.user.id),req.user.id]);const sessionToken=req.cookies?.atsh_platform_session;
if(sessionToken){
  const sessionHash=crypto.createHash('sha256').update(sessionToken).digest('hex');
  await client.query(`UPDATE auth_sessions SET mfa_enrollment_only=false,expires_at=now()+interval '8 hours',last_seen_at=now() WHERE token_hash=$1 AND user_id=$2`,[sessionHash,req.user.id]);
}
await client.query('COMMIT');res.json({ok:true,recoveryCodes:codes});}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}}catch(e){if(e.name==='ZodError')return res.status(400).json({error:'أدخل رمزًا مكونًا من 6 أرقام.'});next(e);}});

router.post('/auth/mfa/rotate',async(req,res,next)=>{
 try{
  const input=z.object({password:z.string().min(1).max(256),code:z.string().trim().min(6).max(32)}).strict().parse(req.body);
  const db=getPool(),token=req.cookies?.atsh_platform_session;
  if(!token)return res.status(401).json({error:'يلزم تسجيل الدخول مجددًا.'});
  const sessionHash=crypto.createHash('sha256').update(token).digest('hex');
  const user=await db.query('SELECT password_hash,email FROM users WHERE id=$1 AND status=\'active\'',[req.user.id]);
  if(!user.rows[0]||!await verifyPassword(input.password,user.rows[0].password_hash))return res.status(401).json({error:'أعد إدخال كلمة المرور الحالية بشكل صحيح.'});
  const client=await db.connect();
  let secret,codes,setupCipher;
  try{
   await client.query('BEGIN');
   const current=await client.query('SELECT secret_ciphertext,last_totp_step,enabled FROM user_mfa WHERE user_id=$1 FOR UPDATE',[req.user.id]);
   if(!current.rows[0]?.enabled){await client.query('ROLLBACK');return res.status(409).json({error:'لا يوجد إعداد MFA مفعّل لتدويره.'});}
   const row=current.rows[0];
   let accepted=false;
   let step=null;
   try{step=mfa.verifyTotp(mfa.decryptSecret(row.secret_ciphertext),input.code,Date.now(),Number(row.last_totp_step));}catch(e){await client.query('ROLLBACK');return res.status(503).json({error:'تعذر التحقق من MFA. تحقق من مفتاح التشفير.'});}
   if(step!==null){
    const updated=await client.query('UPDATE user_mfa SET last_totp_step=$2,updated_at=now() WHERE user_id=$1 AND enabled=true AND last_totp_step<$2',[req.user.id,step]);
    accepted=updated.rowCount===1;
   }else if(/^[a-f0-9]{16}$/i.test(input.code)){
    const consumed=await client.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING id',[req.user.id,mfa.hashRecovery(input.code)]);
    accepted=consumed.rowCount===1;
   }
   if(!accepted){await client.query('ROLLBACK');return res.status(401).json({error:'رمز MFA أو رمز الاسترداد غير صحيح أو سبق استخدامه.'});}
   secret=mfa.generateSecret();setupCipher=mfa.encryptSecret(secret);
   await client.query("UPDATE user_mfa SET secret_ciphertext=$2,enabled=false,last_totp_step=-1,pending_expires_at=now()+interval '10 minutes',updated_at=now() WHERE user_id=$1",[req.user.id,setupCipher]);
   await client.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1',[req.user.id]);
   await client.query('DELETE FROM auth_mfa_challenges WHERE user_id=$1',[req.user.id]);
   await client.query('DELETE FROM auth_sessions WHERE user_id=$1 AND token_hash<>$2',[req.user.id,sessionHash]);
   const session=await client.query("UPDATE auth_sessions SET mfa_enrollment_only=true,expires_at=now()+interval '15 minutes',last_seen_at=now() WHERE user_id=$1 AND token_hash=$2 RETURNING user_id",[req.user.id,sessionHash]);
   if(!session.rowCount){await client.query('ROLLBACK');return res.status(401).json({error:'انتهت الجلسة. سجل الدخول مجددًا.'});}
   await client.query("INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) SELECT organization_id,$1,'auth.mfa_rotated','user',$2,jsonb_build_object('recovery_code_used',$3) FROM users WHERE id=$4",[req.user.id,String(req.user.id),step===null,req.user.id]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  const issuer='ATSH%20AI',account=encodeURIComponent(user.rows[0].email);
  res.json({ok:true,mfaEnrollmentRequired:true,secret,otpauthUrl:'otpauth://totp/'+issuer+':'+account+'?secret='+secret+'&issuer='+issuer+'&algorithm=SHA1&digits=6&period=30',message:'تم تدوير إعداد MFA وإبطال رموز الاسترداد والتحديات والجلسات الأخرى. أكمل التفعيل خلال 10 دقائق.'});
 }catch(e){if(e.name==='ZodError')return res.status(400).json({error:'أدخل كلمة المرور الحالية ورمز MFA أو رمز استرداد صالحًا.'});next(e);}
});

module.exports=router;
