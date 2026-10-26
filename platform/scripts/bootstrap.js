'use strict';
const {getPool,closePool}=require('../src/db');
const {passwordHash}=require('../src/auth');
(async()=>{
 const orgName=process.env.ORGANIZATION_NAME||'ATSH AI';
 const slug=process.env.DEFAULT_ORGANIZATION_SLUG||'atsh-ai';
 const email=String(process.env.OWNER_EMAIL||'').trim().toLowerCase();
 const password=String(process.env.OWNER_PASSWORD||'');
 const fullName=String(process.env.OWNER_NAME||'ATSH AI Owner').trim();
 if(!email||!password||password.length<14){console.error('Set OWNER_EMAIL, OWNER_NAME and OWNER_PASSWORD (minimum 14 characters) in a secure environment.');process.exitCode=1;return;}
 const db=getPool(); const client=await db.connect();
 try{
  await client.query('BEGIN');
  let org=(await client.query('SELECT id FROM organizations WHERE slug=$1 FOR UPDATE',[slug])).rows[0];
  if(!org)org=(await client.query('INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id',[orgName,slug])).rows[0];
  let role=(await client.query("SELECT id FROM roles WHERE organization_id=$1 AND name='Owner'",[org.id])).rows[0];
  if(!role)role=(await client.query("INSERT INTO roles(organization_id,name,permissions,is_system) VALUES($1,'Owner','[\"*\"]'::jsonb,true) RETURNING id",[org.id])).rows[0];
  let user=(await client.query('SELECT id FROM users WHERE organization_id=$1 AND lower(email)=lower($2)',[org.id,email])).rows[0];
  if(!user){user=(await client.query("INSERT INTO users(organization_id,email,full_name,password_hash,status) VALUES($1,$2,$3,$4,'active') RETURNING id",[org.id,email,fullName,await passwordHash(password)])).rows[0];}
  await client.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,role.id]);
  await client.query("INSERT INTO site_settings(organization_id,settings) VALUES($1,'{}'::jsonb) ON CONFLICT (organization_id) DO NOTHING",[org.id]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ok:true,organizationId:org.id,organizationSlug:slug,ownerEmail:email},null,2));
 }catch(e){await client.query('ROLLBACK');console.error(e.message);process.exitCode=1;}
 finally{client.release();await closePool();}
})();
