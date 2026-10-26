'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {pipeline}=require('node:stream/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const {BlobServiceClient}=require('@azure/storage-blob');
const {Pool}=require('pg');
const {getPool,closePool}=require('../src/db');
function parsePgEnv(value){const u=new URL(value);if(!['postgres:','postgresql:'].includes(u.protocol))throw new Error('PostgreSQL URL required.');return {PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.replace(/^\//,''),PGSSLMODE:process.env.PGSSLMODE||(u.searchParams.get('sslmode')||'require')};}
function run(command,args,env){return new Promise((resolve,reject)=>{const p=spawn(command,args,{env,stdio:['ignore','ignore','pipe']});let err='';p.stderr.on('data',d=>{err+=d.toString();});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error(command+' failed ('+code+'): '+err.slice(0,300))));});}
async function decrypt(file,out,key){const h=await fs.promises.open(file,'r');const header=Buffer.alloc(36);try{await h.read(header,0,36,0);}finally{await h.close();}if(header.subarray(0,8).toString()!=='ATSHBK01')throw new Error('Unknown backup format.');const iv=header.subarray(8,20),tag=header.subarray(20,36),decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);await pipeline(createReadStream(file,{start:36}),decipher,createWriteStream(out));}
(async()=>{
 let sourcePool=null,targetPool=null,tempDir=null;
 try{
  const sourceUrl=process.env.DATABASE_URL,targetUrl=process.env.RESTORE_TEST_DATABASE_URL,keyHex=process.env.BACKUP_ENCRYPTION_KEY,storage=process.env.AZURE_STORAGE_CONNECTION_STRING;
  if(!sourceUrl||!targetUrl||!keyHex||!storage)throw new Error('Missing restore-test configuration.');
  const key=Buffer.from(keyHex,'hex');if(key.length!==32||keyHex.length!==64)throw new Error('Invalid encryption key length.');
  sourcePool=getPool();const result=await sourcePool.query("SELECT id,organization_id,artifact_ref FROM backup_runs WHERE status IN ('succeeded','restore_tested') AND artifact_ref LIKE 'azure-blob://%' ORDER BY created_at DESC LIMIT 1");const backup=result.rows[0];if(!backup)throw new Error('No completed backup artifact found.');
  const m=backup.artifact_ref.match(/^azure-blob:\/\/([^/]+)\/(.+)$/);if(!m)throw new Error('Backup artifact reference is invalid.');
  const service=BlobServiceClient.fromConnectionString(storage),container=service.getContainerClient(m[1]),blob=container.getBlobClient(m[2]);
  tempDir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'atsh-restore-test-'));const enc=path.join(tempDir,'backup.atshbak'),raw=path.join(tempDir,'database.dump');await blob.downloadToFile(enc);await decrypt(enc,raw,key);
  targetPool=new Pool({connectionString:targetUrl,ssl:(new URL(targetUrl).searchParams.get('sslmode')==='disable'?false:{rejectUnauthorized:true}),max:1});
  const existing=await targetPool.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')");if(existing.rows[0].n>0)throw new Error('Restore target is not empty; refusing to overwrite data.');
  const pgEnv={...process.env,...parsePgEnv(targetUrl)};await run('pg_restore',['--no-owner','--no-acl','--exit-on-error','--dbname','postgresql://'+encodeURIComponent(pgEnv.PGUSER)+':'+encodeURIComponent(pgEnv.PGPASSWORD)+'@'+pgEnv.PGHOST+':'+pgEnv.PGPORT+'/'+encodeURIComponent(pgEnv.PGDATABASE)],pgEnv);
  const check=await targetPool.query("SELECT (SELECT count(*) FROM organizations)::int organizations,(SELECT count(*) FROM customers)::int customers,(SELECT count(*) FROM projects)::int projects");
  if(!check.rows[0]||check.rows[0].organizations<1)throw new Error('Restore validation failed: organization table is empty.');
  await sourcePool.query("UPDATE backup_runs SET status='restore_tested',restore_tested_at=now(),error_summary=NULL WHERE id=$1",[backup.id]);
  await sourcePool.query("INSERT INTO audit_logs(organization_id,action,entity_type,entity_id,details) VALUES($1,'backup.restore_test','backup_run',$2,$3::jsonb)",[backup.organization_id,String(backup.id),JSON.stringify({target:'isolated restore database',checks:check.rows[0]})]);
  console.log(JSON.stringify({ok:true,backupId:backup.id,checks:check.rows[0]}));
 }catch(err){console.error(JSON.stringify({ok:false,error:err.code||err.name||'restore_test_failed'}));process.exitCode=1;}
 finally{if(targetPool)await targetPool.end().catch(()=>{});if(sourcePool)await closePool().catch(()=>{});if(tempDir)await fs.promises.rm(tempDir,{recursive:true,force:true}).catch(()=>{});}
})();
