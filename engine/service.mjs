import {HttpError,fail,id,iso,text,number,choice,dimensions,fit,baseJob,jobView,publicUser,isOperator,STATUSES,CATEGORIES,MATERIALS,PRIORITIES,detectFile,date} from './domain.mjs';
import {hashPassword,verifyPassword,randomToken,digest} from './security.mjs';
const MAX_FILE=20*1024*1024;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
export function createService({db,objects,mode='lan'}){
 const loginAttempts=new Map();
 const all=(s,a=[])=>db.all(s,a),one=(s,a=[])=>db.first(s,a),run=(s,a=[])=>db.run(s,a);
 const requireOp=u=>{if(!isOperator(u))fail(403,'Ta operacja jest dostępna dla operatora.');};
 const requireAdmin=u=>{if(u?.role!=='admin')fail(403,'Ta operacja wymaga administratora.');};
 async function seed(){if(await one("SELECT value FROM app_meta WHERE key='fleet_seed'"))return;await db.batch([
  {sql:"INSERT OR IGNORE INTO printers(id,name,model,x,y,z,state,notes) VALUES(?,?,?,?,?,?,'ready',?)",args:['p-x1c','X1 Carbon · 01','Bambu Lab X1C',256,256,256,'Domyślny profil floty. Dopasuj do posiadanej drukarki.']},
  {sql:"INSERT OR IGNORE INTO printers(id,name,model,x,y,z,state,notes) VALUES(?,?,?,?,?,?,'ready',?)",args:['p-p1s','P1S · 01','Bambu Lab P1S',256,256,256,'Domyślny profil floty. Dopasuj do posiadanej drukarki.']},
  {sql:"INSERT OR IGNORE INTO printers(id,name,model,x,y,z,state,notes) VALUES(?,?,?,?,?,?,'ready',?)",args:['p-a1mini','A1 mini · 01','Bambu Lab A1 Mini',180,180,180,'Domyślny profil floty. Dopasuj do posiadanej drukarki.']},
  {sql:"INSERT OR IGNORE INTO app_meta(key,value) VALUES('fleet_seed','1')",args:[]}
 ]);}
 async function authenticate(req){
  if(mode==='sites'){
   const uid=req.headers.get('oai-authenticated-user-id');if(!uid)return null;
   const userId='site:'+uid;let u=await one('SELECT * FROM users WHERE id=?',[userId]);
   if(!u){const email=req.headers.get('oai-authenticated-user-email')||('user-'+uid).slice(0,80);let name=req.headers.get('oai-authenticated-user-full-name')||email;try{if(req.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')name=decodeURIComponent(name);}catch{name=email;}
    await run("INSERT OR IGNORE INTO users(id,username,name,role,created_at) SELECT ?,?,?,CASE WHEN EXISTS(SELECT 1 FROM users) THEN 'requester' ELSE 'admin' END,?",[userId,email.toLowerCase(),name.slice(0,120),iso()]);u=await one('SELECT * FROM users WHERE id=?',[userId]);}
   return u?.active?u:null;
  }
  const token=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pm_session='))?.slice(11);if(!token)return null;
  const hash=await digest(token);return one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1',[hash,iso()]);
 }
 async function sessionCookie(req,user){const token=randomToken();await run('DELETE FROM sessions WHERE expires_at<?',[iso()]);await run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',[await digest(token),user.id,new Date(Date.now()+43200000).toISOString()]);return 'pm_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+(new URL(req.url).protocol==='https:'?'; Secure':'');}
 async function body(req){if(Number(req.headers.get('content-length'))>65536)fail(413,'Formularz jest zbyt duży.');try{const raw=await req.text();if(raw.length>65536)fail(413,'Formularz jest zbyt duży.');return JSON.parse(raw);}catch(e){if(e instanceof HttpError)throw e;fail(400,'Nieprawidłowy formularz JSON.');}}
 async function jobFor(uid,user){const j=await one('SELECT * FROM jobs WHERE id=?',[Number(uid)]);if(!j)fail(404,'Nie znaleziono zlecenia.');if(!isOperator(user)&&j.requester_id!==user.id)fail(403,'To zlecenie nie należy do Ciebie.');return j;}
 const log=(job,user,message)=>run('INSERT INTO job_events(id,job_id,actor_id,actor_name,text,created_at) VALUES(?,?,?,?,?,?)',[id(),job,user.id,user.name,message,iso()]);
 async function detail(uid,user){const j=await jobFor(uid,user);return{job:jobView(j),attachments:await all('SELECT id,job_id,name,mime,size,created_at FROM attachments WHERE job_id=? ORDER BY created_at',[j.id]),events:await all('SELECT id,actor_name,text,created_at FROM job_events WHERE job_id=? ORDER BY created_at DESC LIMIT 100',[j.id])};}
 async function handle(req){
  try{
   const url=new URL(req.url),path=url.pathname.replace(/\/$/,''),method=req.method;
   if(!['GET','HEAD','OPTIONS'].includes(method)){const origin=req.headers.get('origin');if(origin&&origin!==url.origin)fail(403,'Zablokowano formularz z innej strony.');}
   if(path==='/api/health')return json({ok:true,app:'Bambu Lab Print Manager',mode});
   await seed();const user=await authenticate(req);
   if(path==='/api/session'&&method==='GET')return json({user:user?publicUser(user):null,mode,setupRequired:mode==='lan'&&!(await one('SELECT id FROM users LIMIT 1')),constants:{statuses:STATUSES,categories:CATEGORIES,materials:MATERIALS,priorities:PRIORITIES},limits:{fileBytes:MAX_FILE,filesPerJob:8}});
   if(path==='/api/auth/setup'&&method==='POST'&&mode==='lan'){
    if(await one('SELECT id FROM users LIMIT 1'))fail(409,'Administrator został już utworzony.');const b=await body(req),username=text(b.username,80,true).toLowerCase(),name=text(b.name,120,true),password=text(b.password,200,true);if(!/^[a-z0-9@._-]{3,80}$/.test(username)||password.length<10)fail(400,'Login: minimum 3 znaki (litery, cyfry, @ . _ -). Hasło: minimum 10 znaków.');
    const u={id:id(),username,name,role:'admin',active:1};const result=await run("INSERT INTO users(id,username,name,password_hash,role,created_at) SELECT ?,?,?,?,'admin',? WHERE NOT EXISTS(SELECT 1 FROM users)",[u.id,username,name,await hashPassword(password),iso()]);if(!result.changes)fail(409,'Administrator został już utworzony.');return json({user:publicUser(u)},201,{'Set-Cookie':await sessionCookie(req,u)});
   }
   if(path==='/api/auth/login'&&method==='POST'&&mode==='lan'){
    const b=await body(req),username=text(b.username,80,true).toLowerCase(),password=text(b.password,200,true);const recent=loginAttempts.get(username)||{count:0,at:Date.now()};if(Date.now()-recent.at>600000){recent.count=0;recent.at=Date.now();}if(recent.count>=12)fail(429,'Zbyt wiele prób. Spróbuj ponownie za 10 minut.');recent.count++;loginAttempts.set(username,recent);const u=await one('SELECT * FROM users WHERE username=? AND active=1',[username]);if(!u||!await verifyPassword(password,u.password_hash))fail(401,'Nieprawidłowy login lub hasło.');loginAttempts.delete(username);return json({user:publicUser(u)},200,{'Set-Cookie':await sessionCookie(req,u)});
   }
   if(!user)fail(401,mode==='sites'?'Zaloguj się na konto mające dostęp do tej prywatnej strony.':'Zaloguj się, aby kontynuować.');
   if(path==='/api/auth/logout'&&method==='POST'){const token=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pm_session='))?.slice(11);if(token)await run('DELETE FROM sessions WHERE token_hash=?',[await digest(token)]);return json({ok:true},200,{'Set-Cookie':'pm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
   if(path==='/api/data'&&method==='GET'){
    const jobs=(await all('SELECT j.*, (SELECT count(*) FROM attachments a WHERE a.job_id=j.id) AS attachment_count FROM jobs j '+(isOperator(user)?'':'WHERE j.requester_id=? ')+'ORDER BY j.id DESC LIMIT 2000',isOperator(user)?[]:[user.id])).map(jobView);
    return json({jobs,printers:await all('SELECT * FROM printers ORDER BY name'),users:(await all("SELECT * FROM users WHERE active=1 AND role IN ('operator','admin') ORDER BY name")).map(publicUser),serverTime:iso()});
   }
   if(path==='/api/jobs'&&method==='POST'){
    const b=await body(req),v=baseJob(b),now=iso();const cols=Object.keys(v);const r=await run('INSERT INTO jobs('+cols.join(',')+',requester_id,created_at,updated_at) VALUES('+[...cols,'a','b','c'].map(()=>'?').join(',')+')',[...Object.values(v),user.id,now,now]);const jid=r.lastRowId;await log(jid,user,'Utworzono zgłoszenie.');return json(await detail(jid,user),201);
   }
   let match=path.match(/^\/api\/jobs\/(\d+)$/);
   if(match&&method==='GET')return json(await detail(match[1],user));
   if(match&&method==='DELETE'){
    requireAdmin(user);const b=await body(req),j=await jobFor(match[1],user);
    if(!Number.isInteger(b.version)||b.version!==j.version)fail(409,'Zlecenie zmienił inny użytkownik. Odśwież listę przed usunięciem.');
    if(j.status==='printing')fail(409,'Zlecenie jest w druku. Najpierw zakończ lub przerwij jego realizację i zmień status.');
    const files=await all('SELECT object_key FROM attachments WHERE job_id=?',[j.id]);
    const result=await run("DELETE FROM jobs WHERE id=? AND version=? AND status<>'printing'",[j.id,b.version]);
    if(!result.changes)fail(409,'Zlecenie zmienił inny użytkownik. Odśwież listę przed usunięciem.');
    let cleanupPending=false;for(const f of files){try{await objects.delete(f.object_key);}catch{cleanupPending=true;console.error('Attachment cleanup required',f.object_key);}}
    return json({ok:true,cleanupPending});
   }
   if(match&&method==='PATCH'){
    requireOp(user);const j=await jobFor(match[1],user),b=await body(req);if(b.version!==j.version)fail(409,'Zlecenie zmienił inny użytkownik. Odśwież podgląd przed zapisem.');
    const status=choice(b.status,STATUSES.map(s=>s[0])),operatorId=b.operatorId||null,printerId=b.printerId||null;
    const operator=operatorId?await one("SELECT * FROM users WHERE id=? AND active=1 AND role IN ('operator','admin')",[operatorId]):null;if(operatorId&&!operator)fail(400,'Wybierz aktywnego operatora.');
    const printer=printerId?await one('SELECT * FROM printers WHERE id=?',[printerId]):null;if(printerId&&!printer)fail(400,'Nie znaleziono drukarki.');
    const dims=dimensions(b.dims===undefined?JSON.parse(j.dims_json):b.dims),start=date(b.scheduledStart),end=date(b.scheduledEnd);if((start&&!end)||(!start&&end)||(start&&end<=start))fail(400,'Podaj początek i koniec rezerwacji; koniec musi wypadać później.');if(start&&!printer)fail(400,'Wybierz drukarkę dla rezerwacji.');
    if(status==='printing'){if(!operator||!printer)fail(400,'Przed rozpoczęciem druku przypisz operatora i drukarkę.');if(printer.state!=='ready')fail(409,'Drukarka nie jest dostępna do pracy.');const f=fit(dims,printer);if(f.status==='no')fail(400,'Model nie mieści się na wybranej drukarce.');}
    const values={status,operator_id:operatorId,printer_id:printerId,dims_json:JSON.stringify(dims),scheduled_start:start,scheduled_end:end,notes:text(b.notes??'',8000),print_minutes:number(b.printMinutes,0,1000000),filament_grams:number(b.filamentGrams,0,1000000),profile:text(b.profile??'',200),priority:choice(b.priority,PRIORITIES.map(x=>x[0]))};
    const overlap=start&&printerId&&status!=='done';const r=await run('UPDATE jobs SET '+Object.keys(values).map(k=>k+'=?').join(',')+',version=version+1,updated_at=? WHERE id=? AND version=?'+(overlap?" AND NOT EXISTS(SELECT 1 FROM jobs x WHERE x.id<>? AND x.printer_id=? AND x.status<>'done' AND x.scheduled_start<? AND x.scheduled_end>?)":''),[...Object.values(values),iso(),j.id,j.version,...(overlap?[j.id,printerId,end,start]:[])]);
    if(!r.changes)fail(409,'Termin koliduje z innym zleceniem lub dane są nieaktualne. Odśwież podgląd.');
    const oldLabel=STATUSES.find(s=>s[0]===j.status)[1],newLabel=STATUSES.find(s=>s[0]===status)[1];await log(j.id,user,j.status===status?'Zaktualizowano parametry pracy i plan wydruku.':oldLabel+' → '+newLabel);return json(await detail(j.id,user));
   }
   match=path.match(/^\/api\/jobs\/(\d+)\/files$/);
   if(match&&method==='POST'){
    const j=await jobFor(match[1],user);if(!isOperator(user)&&!['submitted','waiting'].includes(j.status))fail(403,'Na tym etapie załączniki dodaje operator.');if((await one('SELECT count(*) AS n FROM attachments WHERE job_id=?',[j.id])).n>=8)fail(400,'Limit 8 załączników na zlecenie.');
    if(Number(req.headers.get('content-length'))>MAX_FILE+100000)fail(413,'Plik przekracza limit 20 MB.');const form=await req.formData(),file=form.get('file');if(!file||typeof file==='string'||!file.size)fail(400,'Wybierz niepusty plik.');if(file.size>MAX_FILE)fail(413,'Plik przekracza limit 20 MB.');const name=text(file.name,200,true).replace(/[\r\n]/g,''),bytes=new Uint8Array(await file.arrayBuffer()),mime=detectFile(name,bytes),fid=id(),key='files/'+fid;
    await objects.put(key,bytes,mime);try{const r=await run('INSERT INTO attachments(id,job_id,name,mime,size,object_key,created_by,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM attachments WHERE job_id=?)<8',[fid,j.id,name,mime,file.size,key,user.id,iso(),j.id]);if(!r.changes)fail(400,'Limit 8 załączników na zlecenie.');}catch(e){await objects.delete(key);throw e;}
    await log(j.id,user,'Dodano załącznik: '+name);return json(await detail(j.id,user),201);
   }
   match=path.match(/^\/api\/files\/([a-z0-9-]+)$/i);
   if(match){const file=await one('SELECT * FROM attachments WHERE id=?',[match[1]]);if(!file)fail(404,'Nie znaleziono pliku.');const j=await jobFor(file.job_id,user);
    if(method==='GET'){const object=await objects.get(file.object_key);if(!object)fail(404,'Plik jest niedostępny.');const inline=url.searchParams.get('inline')==='1'&&file.mime.startsWith('image/');return new Response(object.body,{headers:{'Content-Type':file.mime,'Content-Length':String(file.size),'Content-Disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(file.name),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"}});}
    if(method==='DELETE'){if(!isOperator(user)&&!['submitted','waiting'].includes(j.status))fail(403,'Na tym etapie załączniki usuwa operator.');await objects.delete(file.object_key);await run('DELETE FROM attachments WHERE id=?',[file.id]);await log(j.id,user,'Usunięto załącznik: '+file.name);return json({ok:true});}
   }
   if(path==='/api/users'&&method==='GET'){requireAdmin(user);return json({users:(await all('SELECT * FROM users ORDER BY created_at')).map(publicUser)});}
   if(path==='/api/users'&&method==='POST'){
    requireAdmin(user);if(mode==='sites')fail(400,'W Sites konta powstają po pierwszym logowaniu osób z dostępem do strony.');const b=await body(req),username=text(b.username,80,true).toLowerCase(),name=text(b.name,120,true),password=text(b.password,200,true),role=choice(b.role,['requester','operator','admin']);if(!/^[a-z0-9@._-]{3,80}$/.test(username)||password.length<10)fail(400,'Login: minimum 3 znaki. Hasło: minimum 10 znaków.');await run('INSERT INTO users(id,username,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',[id(),username,name,await hashPassword(password),role,iso()]);return json({ok:true},201);
   }
   match=path.match(/^\/api\/users\/([^/]+)$/);
   if(match&&method==='PATCH'){requireAdmin(user);const target=await one('SELECT * FROM users WHERE id=?',[decodeURIComponent(match[1])]);if(!target)fail(404,'Nie znaleziono konta.');const b=await body(req),role=choice(b.role,['requester','operator','admin']),active=b.active?1:0;if(target.role==='admin'&&(!active||role!=='admin')&&(await one("SELECT count(*) AS n FROM users WHERE role='admin' AND active=1")).n<=1)fail(400,'Musi pozostać co najmniej jeden aktywny administrator.');if((!active||!['operator','admin'].includes(role))&&await one("SELECT id FROM jobs WHERE operator_id=? AND status='printing'",[target.id]))fail(409,'Konto obsługuje trwający wydruk. Zmień przydział przed wyłączeniem.');let hash=target.password_hash;if(b.password){if(mode==='sites')fail(400,'Hasło do Sites zarządzane jest przez ChatGPT.');if(text(b.password,200,true).length<10)fail(400,'Hasło musi mieć co najmniej 10 znaków.');hash=await hashPassword(b.password);await run('DELETE FROM sessions WHERE user_id=?',[target.id]);}await run('UPDATE users SET role=?,active=?,password_hash=? WHERE id=?',[role,active,hash,target.id]);return json({ok:true});}
   if(path==='/api/printers'&&method==='POST'){requireOp(user);const b=await body(req);await run('INSERT INTO printers(id,name,model,x,y,z,state,notes) VALUES(?,?,?,?,?,?,?,?)',[id(),text(b.name,100,true),text(b.model,100,true),number(b.x,1,5000,false),number(b.y,1,5000,false),number(b.z,1,5000,false),choice(b.state,['ready','service','offline']),text(b.notes??'',2000)]);return json({ok:true},201);}
   match=path.match(/^\/api\/printers\/([a-z0-9-]+)$/i);
   if(match&&method==='PATCH'){requireOp(user);if(!await one('SELECT id FROM printers WHERE id=?',[match[1]]))fail(404,'Nie znaleziono drukarki.');const b=await body(req),state=choice(b.state,['ready','service','offline']);if(await one("SELECT id FROM jobs WHERE printer_id=? AND status='printing'",[match[1]]))fail(409,'Najpierw zakończ lub przenieś trwający wydruk na tej drukarce.');await run('UPDATE printers SET name=?,model=?,x=?,y=?,z=?,state=?,notes=? WHERE id=?',[text(b.name,100,true),text(b.model,100,true),number(b.x,1,5000,false),number(b.y,1,5000,false),number(b.z,1,5000,false),state,text(b.notes??'',2000),match[1]]);return json({ok:true});}
   fail(404,'Nie znaleziono tej operacji.');
  }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);const message=String(e?.message||e);if(/one_printing_per_printer|UNIQUE constraint failed: jobs.printer_id/.test(message))return json({error:'Na tej drukarce trwa już inne zlecenie.'},409);if(/UNIQUE constraint failed: users.username/.test(message))return json({error:'Ten login już istnieje.'},409);console.error('Print Manager request failed:',message);return json({error:'Nie udało się wykonać operacji. Spróbuj ponownie lub sprawdź logi serwera.'},500);}
 }
 return{handle};
}
