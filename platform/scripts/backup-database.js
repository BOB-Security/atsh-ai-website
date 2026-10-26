'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {pipeline}=require('node:stream/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const {BlobServiceClient}=require('@azure/storage-blob');
const {getPool,closePool}=require('../src/db');
const REQUIRED=['DATABASE_URL','BACKUP_ENCRYPTION_KEY','AZURE_STORAGE_CONNECTION_STRING'];
function validateEnv(){for(const k of REQUIRED)if(!process.env[k])throw new Error('Missing required backup configuration: '+k);const key=Buffer.from(process.env.BACKUP_ENCRYPTION_KEY,'hex');if(key.length!==32||process.env.BACKUP_ENCRYPTION_KEY.length!==64)throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters.');return key;}
function pgEnv(){const u=new URL(process.env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(u.protocol))throw new Error('DATABASE_URL must use PostgreSQL.');return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.replace(/^\//,''),PGSSLMODE:process.env.PGSSLMODE||(u.searchParams.get('sslmode')||'require')};}
function runPgDump(file){return new Promise((resolve,reject)=>{const child=spawn('pg_dump',['--format=custom','--no-owner','--no-acl','--file',file],{env:pgEnv(),stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',d=>{stderr+=d.toString();});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('pg_dump failed with exit code '+code+' ('+stderr.slice(0,300)+')')));});}
async function encryptArchive(rawFile,encryptedFile,key){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);await pipeline(createReadStream(rawFile),cipher,createWriteStream(encryptedFile));const tag=cipher.getAuthTag();const header=Buffer.concat([Buffer.from('ATSHBK01'),iv,tag]);const finalFile=encryptedFile+'.atshbak';await fs.promises.writeFile(finalFile,header);await pipeline(createReadStream(encryptedFile),createWriteStream(finalFile,{flags:'a'}));return finalFile;}
(async()=>{
 let runId=null,tempDir=null,pool=null;
 try{
  const key=validateEnv(),cfg=process.env,retentionDays=Math.min(365,Math.max(1,Number(cfg.BACKUP_RETENTION_DAYS||30)));
  pool=getPool();const org=cfg.DEFAULT_ORGANIZATION_ID?(await pool.query('SELECT id,slug FROM organizations WHERE id=$1',[cfg.DEFAULT_ORGANIZATION_ID])).rows[0]:(await pool.query('SELECT id,slug FROM organizations WHERE slug=$1',[cfg.DEFAULT_ORGANIZATION_SLUG||'atsh-ai'])).rows[0];
  if(!org)throw new Error('Organization not found; run database migrations and bootstrap first.');
  const scope={type:'platform_database',format:'pg_dump-custom',encrypted:true,algorithm:'AES-256-GCM',retentionDays};
  const started=await pool.query("INSERT INTO backup_runs(organization_id,status,scope,started_at) VALUES($1,'running',$2::jsonb,now()) RETURNING id",[org.id,JSON.stringify(scope)]);runId=started.rows[0].id;
  tempDir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'atsh-backup-'));const raw=path.join(tempDir,'database.dump'),encrypted=path.join(tempDir,'database.enc');
  await runPgDump(raw);const finalFile=await encryptArchive(raw,encrypted,key);
  const service=BlobServiceClient.fromConnectionString(cfg.AZURE_STORAGE_CONNECTION_STRING),containerName=cfg.BACKUP_CONTAINER||'atsh-ai-db-backups',container=service.getContainerClient(containerName);await container.createIfNotExists();
  const now=new Date(),retentionUntil=new Date(now.getTime()+retentionDays*86400000).toISOString().slice(0,10),stamp=now.toISOString().replace(/[:.]/g,'-'),blobName=org.slug+'/'+now.getUTCFullYear()+'/'+String(now.getUTCMonth()+1).padStart(2,'0')+'/'+stamp+'-'+crypto.randomUUID()+'.atshbak',blob=container.getBlockBlobClient(blobName);
  const stat=await fs.promises.stat(finalFile);await blob.uploadFile(finalFile,{blobHTTPHeaders:{blobContentType:'application/octet-stream'},metadata:{format:'ATSHBK01',encrypted:'aes-256-gcm',organization:org.slug,createdat:now.toISOString(),sizebytes:String(stat.size)}});await blob.setTags({organization:org.slug,retentionuntil:retentionUntil});
  const artifactRef='azure-blob://'+containerName+'/'+blobName;
  await pool.query("UPDATE backup_runs SET status='succeeded',finished_at=now(),retention_until=$2,artifact_ref=$3,error_summary=NULL WHERE id=$1",[runId,retentionUntil,artifactRef]);
  console.log(JSON.stringify({ok:true,runId,organization:org.slug,artifactRef,encrypted:true,bytes:stat.size,retentionUntil}));
 }catch(err){
  console.error(JSON.stringify({ok:false,error:err.code||err.name||'backup_failed'}));
  if(pool&&runId){try{await pool.query("UPDATE backup_runs SET status='failed',finished_at=now(),error_summary=$2 WHERE id=$1",[runId,String(err.code||err.name||'backup_failed').slice(0,200)]);}catch{}}
  process.exitCode=1;
 }finally{
  if(tempDir)await fs.promises.rm(tempDir,{recursive:true,force:true}).catch(()=>{});
  if(pool)await closePool().catch(()=>{});
 }
})();
