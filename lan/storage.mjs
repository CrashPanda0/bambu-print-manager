import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,readFileSync,existsSync} from 'node:fs';
import {writeFile,rename,readFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
export function openDatabase(filename,migrationDir){
 mkdirSync(resolve(filename,'..'),{recursive:true});const conn=new DatabaseSync(filename);conn.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 conn.exec('CREATE TABLE IF NOT EXISTS pm_migrations(name TEXT PRIMARY KEY,hash TEXT NOT NULL)');
 for(const name of readdirSync(migrationDir).filter(f=>f.endsWith('.sql')).sort()){
  const sql=readFileSync(join(migrationDir,name),'utf8'),hash=createHash('sha256').update(sql).digest('hex'),old=conn.prepare('SELECT hash FROM pm_migrations WHERE name=?').get(name);if(old){if(old.hash!==hash)throw Error('Zmieniono zastosowaną migrację: '+name);continue;}
  conn.exec('BEGIN IMMEDIATE');try{conn.exec(sql);conn.prepare('INSERT INTO pm_migrations(name,hash) VALUES(?,?)').run(name,hash);conn.exec('COMMIT');}catch(e){conn.exec('ROLLBACK');throw e;}
 }
 const db={all:async(s,a=[])=>conn.prepare(s).all(...a),first:async(s,a=[])=>conn.prepare(s).get(...a)||null,run:async(s,a=[])=>{const r=conn.prepare(s).run(...a);return{changes:Number(r.changes),lastRowId:Number(r.lastInsertRowid)};},batch:async statements=>{conn.exec('BEGIN IMMEDIATE');try{const out=statements.map(({sql,args=[]})=>conn.prepare(sql).run(...args));conn.exec('COMMIT');return out;}catch(e){conn.exec('ROLLBACK');throw e;}},close:()=>conn.close()};return db;
}
export function fileObjects(directory){mkdirSync(directory,{recursive:true});const path=key=>{if(!/^files\/[a-z0-9-]+$/i.test(key))throw Error('Nieprawidłowy klucz pliku.');return join(directory,key.slice(6));};return{put:async(key,bytes)=>{const p=path(key),temp=p+'.tmp';await writeFile(temp,bytes,{flag:'wx'});await rename(temp,p);},get:async key=>{try{return{body:new Uint8Array(await readFile(path(key)))}}catch(e){if(e.code==='ENOENT')return null;throw e;}},delete:async key=>{try{await unlink(path(key));}catch(e){if(e.code!=='ENOENT')throw e;}}};}
