import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase,fileObjects} from '../lan/storage.mjs';
import {createService} from '../engine/service.mjs';
import {fit} from '../engine/domain.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const payload=(title='Uchwyt testowy')=>({title,category:'Narzędzie / Uchwyt',requesterName:'Jan Kowalski',description:'Uchwyt testowy do czujnika, zastosowanie wewnątrz budynku.',material:'PETG',color:'Czarny',infill:25,requirements:'Obciążenie do 2 kg',priority:'normal',dims:[100,60,20],links:['https://www.printables.com/model/123'],dueDate:null});
const patch=(j,changes={})=>({version:j.version,status:j.status,operatorId:j.operator_id,printerId:j.printer_id,dims:j.dims,scheduledStart:j.scheduled_start,scheduledEnd:j.scheduled_end,notes:j.notes,printMinutes:j.print_minutes,filamentGrams:j.filament_grams,profile:j.profile,priority:j.priority,...changes});

test('pełny proces API, uprawnienia, SQLite i załączniki',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'bambu-pm-'));let db=openDatabase(join(dir,'db.sqlite'),join(root,'drizzle'));const objects=fileObjects(join(dir,'uploads'));let app=createService({db,objects});let adminCookie,operatorCookie,employeeCookie,otherCookie,job,operatorId,secondJob;
 const call=async(path,method='GET',body,cookie,headers={})=>{const r=await app.handle(new Request('http://localhost:3000/api'+path,{method,headers:{...(cookie?{cookie}:{}),...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{}),...headers},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)}));let b;try{b=await r.clone().json();}catch{}return{r,b};};
 const login=async(username)=>{const{r,b}=await call('/auth/login','POST',{username,password:'Test-password-123!'});assert.equal(r.status,200,b?.error);return r.headers.get('set-cookie').split(';')[0];};
 try{
 await t.test('brak anonimowego dostępu do danych',async()=>{const a=await call('/session');assert.equal(a.b.setupRequired,true);assert.equal((await call('/data')).r.status,401);});
 await t.test('pierwszy administrator i sesja HttpOnly',async()=>{const {r,b}=await call('/auth/setup','POST',{username:'admin',name:'Admin Testowy',password:'Test-password-123!'});assert.equal(r.status,201,b?.error);assert.equal(b.user.role,'admin');assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);adminCookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await call('/auth/setup','POST',{username:'rogue',name:'X',password:'Test-password-123!'})).r.status,409);});
 await t.test('fałszywe nagłówki Sites nie dają uprawnień w LAN',async()=>assert.equal((await call('/data','GET',undefined,undefined,{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'admin@example.com'})).r.status,401));
 await t.test('administrator tworzy operatora i konta pracowników',async()=>{for(const [username,name,role] of [['operator','Operator Testowy','operator'],['employee','Jan Kowalski','requester'],['other','Anna Nowak','requester']]){const r=await call('/users','POST',{username,name,role,password:'Test-password-123!'},adminCookie);assert.equal(r.r.status,201,r.b?.error);}operatorCookie=await login('operator');employeeCookie=await login('employee');otherCookie=await login('other');const users=(await call('/users','GET',undefined,adminCookie)).b.users;operatorId=users.find(u=>u.username==='operator').id;assert(users.every(u=>u.password_hash===undefined));});
 await t.test('błędne hasło oraz cross-origin są odrzucane',async()=>{assert.equal((await call('/auth/login','POST',{username:'admin',password:'bad'})).r.status,401);assert.equal((await call('/jobs','POST',payload(),employeeCookie,{origin:'https://other.test'})).r.status,403);});
 await t.test('zgłoszenie pracownika otrzymuje numer i historię',async()=>{const {r,b}=await call('/jobs','POST',payload(),employeeCookie);assert.equal(r.status,201,b?.error);job=b.job;assert.equal(job.number,'PM-0001');assert.equal(b.events.length,1);assert.equal(job.status,'submitted');assert.equal(job.material,'PETG');});
 await t.test('własność zleceń i plików jest serwerowa',async()=>{assert.equal((await call('/jobs/'+job.id,'GET',undefined,otherCookie)).r.status,403);assert.equal((await call('/data','GET',undefined,otherCookie)).b.jobs.length,0);assert.equal((await call('/jobs/'+job.id,'PATCH',patch(job),employeeCookie)).r.status,403);assert.equal((await call('/users','GET',undefined,employeeCookie)).r.status,403);assert.equal((await call('/printers','POST',{},employeeCookie)).r.status,403);});
 await t.test('niedozwolone protokoły odrzucane, częściowe wymiary opcjonalne',async()=>{assert.equal((await call('/jobs','POST',{...payload(),links:['javascript:alert(1)']},employeeCookie)).r.status,400);assert.equal((await call('/jobs','POST',{...payload(),dims:[100,null,30]},employeeCookie)).r.status,201);});
 let pngId,stlId;
 await t.test('upload STL, PDF i miniatury PNG, pobranie identycznych bajtów',async()=>{
  const fixtures=[['part.stl',new TextEncoder().encode('solid test\nendsolid test'),'application/octet-stream'],['drawing.pdf',new TextEncoder().encode('%PDF-1.4\nTest PDF'),'application/pdf'],['preview.png',Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64')),'image/png']];
  for(const [name,bytes,mime]of fixtures){const f=new FormData();f.set('file',new File([bytes],name));const{r,b}=await call('/jobs/'+job.id+'/files','POST',f,employeeCookie);assert.equal(r.status,201,b?.error);const file=b.attachments.find(f=>f.name===name);assert.equal(file.mime,mime);const download=await call('/files/'+file.id,'GET',undefined,operatorCookie);assert.equal(download.r.status,200);assert.deepEqual(new Uint8Array(await download.r.arrayBuffer()),bytes);assert.match(download.r.headers.get('content-disposition'),/attachment/);if(name.endsWith('png'))pngId=file.id;if(name.endsWith('stl'))stlId=file.id;}
  const inline=await call('/files/'+pngId+'?inline=1','GET',undefined,employeeCookie);assert.match(inline.r.headers.get('content-disposition'),/^inline/);assert.equal((await call('/files/'+pngId,'GET',undefined,otherCookie)).r.status,403);
 });
 await t.test('pliki wykonywalne i fałszywe obrazy są blokowane',async()=>{for(const name of ['bad.exe','fake.png']){const f=new FormData();f.set('file',new File(['not an image'],name));assert.equal((await call('/jobs/'+job.id+'/files','POST',f,employeeCookie)).r.status,400);}});
 await t.test('limit rozmiaru pliku sprawdzany przed odczytem',async()=>assert.equal((await call('/jobs/'+job.id+'/files','POST',new FormData(),employeeCookie,{'content-length':String(22*1024*1024)})).r.status,413));
 await t.test('przypisanie, profil, notatki i rezerwacja są zapisywane',async()=>{const {r,b}=await call('/jobs/'+job.id,'PATCH',patch(job,{operatorId,printerId:'p-p1s',status:'prepared',scheduledStart:'2026-11-01T10:00:00.000Z',scheduledEnd:'2026-11-01T12:00:00.000Z',notes:'PLA nie spełni warunków. Ustawiono PETG.',profile:'0.20 mm Standard',printMinutes:120,filamentGrams:54.5}),operatorCookie);assert.equal(r.status,200,b?.error);job=b.job;assert.equal(job.operator_id,operatorId);assert.equal(job.filament_grams,54.5);assert.equal(job.profile,'0.20 mm Standard');});
 await t.test('nieaktualna wersja nie nadpisuje danych',async()=>{const {r}=await call('/jobs/'+job.id,'PATCH',patch(job,{version:1,notes:'Stara wersja'}),operatorCookie);assert.equal(r.status,409);assert.notEqual((await call('/jobs/'+job.id,'GET',undefined,employeeCookie)).b.job.notes,'Stara wersja');});
 await t.test('kolizja rezerwacji zablokowana, stykające terminy dozwolone',async()=>{secondJob=(await call('/jobs','POST',payload('Drugi uchwyt'),employeeCookie)).b.job;let result=await call('/jobs/'+secondJob.id,'PATCH',patch(secondJob,{operatorId,printerId:'p-p1s',scheduledStart:'2026-11-01T11:00:00.000Z',scheduledEnd:'2026-11-01T13:00:00.000Z'}),operatorCookie);assert.equal(result.r.status,409);result=await call('/jobs/'+secondJob.id,'PATCH',patch(secondJob,{operatorId,printerId:'p-p1s',scheduledStart:'2026-11-01T12:00:00.000Z',scheduledEnd:'2026-11-01T14:00:00.000Z'}),operatorCookie);assert.equal(result.r.status,200,result.b?.error);secondJob=result.b.job;});
 await t.test('walidacja gabarytów i wymaganych przydziałów przed drukiem',async()=>{assert.equal((await call('/jobs/'+job.id,'PATCH',patch(job,{status:'printing',operatorId:null}),operatorCookie)).r.status,400);assert.equal((await call('/jobs/'+job.id,'PATCH',patch(job,{status:'printing',dims:[300,300,20]}),operatorCookie)).r.status,400);});
 await t.test('rozpoczęcie druku i blokada drugiego równoległego wydruku',async()=>{const r=await call('/jobs/'+job.id,'PATCH',patch(job,{status:'printing'}),operatorCookie);assert.equal(r.r.status,200,r.b?.error);job=r.b.job;assert.equal((await call('/jobs/'+secondJob.id,'PATCH',patch(secondJob,{status:'printing'}),operatorCookie)).r.status,409);});
 await t.test('pracownik nie dodaje plików po rozpoczęciu realizacji',async()=>{const f=new FormData();f.set('file',new File(['solid x'],'late.stl'));assert.equal((await call('/jobs/'+job.id+'/files','POST',f,employeeCookie)).r.status,403);assert.equal((await call('/files/'+stlId,'DELETE',undefined,employeeCookie)).r.status,403);});
 await t.test('chroniona flota i przypisany operator w trakcie pracy',async()=>{assert.equal((await call('/users/'+operatorId,'PATCH',{role:'requester',active:true},adminCookie)).r.status,409);assert.equal((await call('/printers/p-p1s','PATCH',{name:'P1S',model:'P1S',x:256,y:256,z:256,state:'service',notes:''},operatorCookie)).r.status,409);});
 await t.test('kontrola jakości, odbiór i zakończenie z historią',async()=>{for(const status of ['quality','ready','done']){const {r,b}=await call('/jobs/'+job.id,'PATCH',patch(job,{status}),operatorCookie);assert.equal(r.status,200,b?.error);job=b.job;}const d=(await call('/jobs/'+job.id,'GET',undefined,employeeCookie)).b;assert.equal(d.job.status,'done');assert(d.events.some(e=>e.text.includes('Zakończone')));});
 await t.test('operator pobiera i usuwa pliki, bez dostępu anonimowego',async()=>{assert.equal((await call('/files/'+pngId)).r.status,401);assert.equal((await call('/files/'+pngId,'DELETE',undefined,operatorCookie)).r.status,200);assert.equal((await call('/files/'+pngId,'GET',undefined,operatorCookie)).r.status,404);});
 await t.test('zmiana gotowości drukarki i blokada druku w serwisie',async()=>{const r=await call('/printers/p-p1s','PATCH',{name:'P1S - Serwis',model:'Bambu P1S',x:256,y:256,z:256,state:'service',notes:'Wymiana dyszy'},operatorCookie);assert.equal(r.r.status,200,r.b?.error);assert.equal((await call('/jobs/'+secondJob.id,'PATCH',patch(secondJob,{status:'printing'}),operatorCookie)).r.status,409);});
 await t.test('ochrona ostatniego administratora',async()=>{const users=(await call('/users','GET',undefined,adminCookie)).b.users,u=users.find(u=>u.role==='admin');assert.equal((await call('/users/'+u.id,'PATCH',{role:'requester',active:true},adminCookie)).r.status,400);});
 await t.test('baza, sesje, notatki i pliki przetrwały ponowne otwarcie',async()=>{db.close();db=openDatabase(join(dir,'db.sqlite'),join(root,'drizzle'));app=createService({db,objects});const d=await call('/jobs/'+job.id,'GET',undefined,employeeCookie);assert.equal(d.r.status,200,d.b?.error);assert.equal(d.b.job.notes,'PLA nie spełni warunków. Ustawiono PETG.');assert.equal((await call('/files/'+stlId,'GET',undefined,employeeCookie)).r.status,200);});
 await t.test('trzech administratorów i opcjonalne wymiary przez cały cykl',async()=>{
  for(const username of ['admin2','admin3'])assert.equal((await call('/users','POST',{username,name:username,role:'admin',password:'Test-password-123!'},adminCookie)).r.status,201);
  const admins=(await call('/users','GET',undefined,adminCookie)).b.users.filter(u=>u.role==='admin');assert.equal(admins.length,3);
  let j=(await call('/jobs','POST',{...payload('Bez wymiarów'),dims:undefined},employeeCookie)).b.job;
  assert.deepEqual(j.dims,[null,null,null]);
  const secondAdmin=await login('admin2'),thirdAdmin=await login('admin3');
  for(const status of ['prepared','printing','quality','ready','done']){const r=await call('/jobs/'+j.id,'PATCH',patch(j,{status,operatorId,printerId:'p-x1c',dims:undefined,notes:'Bez pomiarów'}),secondAdmin);assert.equal(r.r.status,200,r.b?.error);j=r.b.job;assert.deepEqual(j.dims,[null,null,null]);}
  assert.equal((await call('/jobs/'+j.id,'DELETE',{version:j.version},thirdAdmin)).r.status,200);
 });
 await t.test('usuwanie wymaga admina i aktualnej wersji; czyści dane i pliki',async()=>{
  let j=(await call('/jobs','POST',payload('Do usunięcia'),employeeCookie)).b.job;
  const file=new FormData();file.set('file',new File(['solid part'],'part.stl'));
  const uploaded=await call('/jobs/'+j.id+'/files','POST',file,employeeCookie);const fid=uploaded.b.attachments[0].id;
  for(const cookie of [employeeCookie,operatorCookie])assert.equal((await call('/jobs/'+j.id,'DELETE',{version:j.version},cookie)).r.status,403);
  assert.equal((await call('/jobs/'+j.id,'DELETE',{version:j.version})).r.status,401);
  assert.equal((await call('/jobs/'+j.id,'DELETE',{version:j.version+1},adminCookie)).r.status,409);
  assert.equal((await call('/files/'+fid,'GET',undefined,adminCookie)).r.status,200);
  const deleted=await call('/jobs/'+j.id,'DELETE',{version:j.version},adminCookie);assert.equal(deleted.r.status,200);assert.equal(deleted.b.cleanupPending,false);
  assert.equal((await call('/jobs/'+j.id,'GET',undefined,adminCookie)).r.status,404);
  assert.equal((await call('/files/'+fid,'GET',undefined,adminCookie)).r.status,404);
  assert.equal(await objects.get('files/'+fid),null);
  assert.equal((await db.first('SELECT count(*) n FROM job_events WHERE job_id=?',[j.id])).n,0);
  assert(!(await call('/data','GET',undefined,adminCookie)).b.jobs.some(x=>x.id===j.id));
 });
 await t.test('usuwanie aktywnego wydruku jest blokowane, seria usuwa niezależnie',async()=>{
  let j=(await call('/jobs','POST',payload('Aktywny wydruk'),employeeCookie)).b.job;
  j=(await call('/jobs/'+j.id,'PATCH',patch(j,{status:'printing',operatorId,printerId:'p-x1c',dims:[null,null,null]}),operatorCookie)).b.job;
  assert.equal((await call('/jobs/'+j.id,'DELETE',{version:j.version},adminCookie)).r.status,409);
  assert.equal((await call('/jobs/'+j.id,'GET',undefined,adminCookie)).r.status,200);
  const other=(await call('/jobs','POST',payload('Drugi do usunięcia'),employeeCookie)).b.job;
  assert.equal((await call('/jobs/'+other.id,'DELETE',{version:other.version},adminCookie)).r.status,200);
  j=(await call('/jobs/'+j.id,'PATCH',patch(j,{status:'quality'}),operatorCookie)).b.job;
  assert.equal((await call('/jobs/'+j.id,'DELETE',{version:j.version},adminCookie)).r.status,200);
 });
 await t.test('wylogowanie unieważnia sesję',async()=>{assert.equal((await call('/auth/logout','POST',{},employeeCookie)).r.status,200);assert.equal((await call('/data','GET',undefined,employeeCookie)).r.status,401);});
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('Sites: wymagana tożsamość i domyślne role',async()=>{const dir=await mkdtemp(join(tmpdir(),'bambu-sites-'));const db=openDatabase(join(dir,'db.sqlite'),join(root,'drizzle'));try{const s=createService({db,objects:fileObjects(join(dir,'uploads')),mode:'sites'});const get=uid=>s.handle(new Request('https://example.chatgpt.site/api/session',{headers:uid?{'oai-authenticated-user-id':uid,'oai-authenticated-user-email':uid+'@test.invalid'}:{}}));assert.equal((await(await get()).json()).user,null);assert.equal((await(await get('owner')).json()).user.role,'admin');assert.equal((await(await get('employee')).json()).user.role,'requester');assert.equal((await s.handle(new Request('https://example.chatgpt.site/api/data'))).status,401);}finally{db.close();await rm(dir,{recursive:true,force:true});}});

test('dopasowanie: obrót XY, stała wysokość i brak wymiarów',()=>{assert.equal(fit([240,180,40],{x:200,y:250,z:50}).rotated,true);assert.equal(fit([50,50,270],{x:256,y:256,z:256}).status,'no');assert.equal(fit([null,null,null],{x:256,y:256,z:256}).status,'unknown');});
