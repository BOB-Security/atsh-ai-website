'use strict';
const {Pool}=require('pg');let pool;
function getPool(config){if(!config.databaseUrl)throw new Error('DATABASE_URL is not configured');if(!pool){pool=new Pool({connectionString:config.databaseUrl,ssl:config.pgSsl==='require'?{rejectUnauthorized:true}:false,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,application_name:'atsh-ai-platform'});pool.on('error',err=>console.error('Unexpected database client error',{name:err.name}));}return pool;}
async function checkDatabase(config){const result=await getPool(config).query('SELECT current_database() AS database_name');return{connected:true,database:result.rows[0].database_name};}
async function closePool(){if(pool){const current=pool;pool=undefined;await current.end();}}
module.exports={getPool,checkDatabase,closePool};