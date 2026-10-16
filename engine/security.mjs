const encoder=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async v=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(v)));
export async function hashPassword(password,salt=randomToken().slice(0,32)){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256);return salt+':'+hex(bits);}
export async function verifyPassword(password,hash){if(!hash)return false;const expected=await hashPassword(password,hash.split(':')[0]);if(expected.length!==hash.length)return false;let diff=0;for(let i=0;i<hash.length;i++)diff|=hash.charCodeAt(i)^expected.charCodeAt(i);return diff===0;}
