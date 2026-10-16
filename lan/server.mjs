import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createService} from '../engine/service.mjs';
import {openDatabase,fileObjects} from './storage.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),data=resolve(process.env.DATA_DIR||join(root,'data'));
const db=openDatabase(join(data,'print-manager.sqlite'),join(root,'drizzle'));
const service=createService({db,objects:fileObjects(join(data,'uploads')),mode:'lan'});
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
export const server=createServer(async(req,res)=>{try{
 const host=req.headers.host||'localhost';const url=new URL(req.url,process.env.APP_ORIGIN||'http://'+host);if(url.pathname.startsWith('/api/')){
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>21*1024*1024){res.writeHead(413,{'Content-Type':'application/json',...headers});res.end(JSON.stringify({error:'Przesłany plik jest zbyt duży.'}));return;}chunks.push(chunk);}
  const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await service.handle(request);res.writeHead(response.status,{...headers,...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const path=url.pathname==='/'?'/manager.html':decodeURIComponent(url.pathname);const allowed=['/manager.html','/app.js','/styles.css','/favicon.svg'];if(!allowed.includes(path)){res.writeHead(404,headers);res.end('Nie znaleziono strony.');return;}
 const content=await readFile(join(root,'public',path));const ext=path.slice(path.lastIndexOf('.'));res.writeHead(200,{...headers,'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
 }catch(e){console.error('HTTP request failed:',e.message);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json',...headers});res.end(JSON.stringify({error:'Błąd serwera.'}));}});
const port=Number(process.env.PORT||3000),host=process.env.HOST||'0.0.0.0';server.listen(port,host,()=>console.log('Bambu Lab Print Manager: http://'+host+':'+server.address().port));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
