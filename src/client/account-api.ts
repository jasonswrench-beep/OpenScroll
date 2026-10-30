export interface Account {id:string;email:string;name:string;role:'owner'|'author';approvalStatus:'pending'|'approved'|'revoked';verified:boolean;}
export interface Session {author:Account|null;csrf:string|null;registrationEnabled:boolean;verificationRequired:boolean;}
export let account:Account|null=null;
let csrf:string|null=null;
export function setAccount(next:Account|null,token:string|null) {
  account=next;csrf=token;
  window.dispatchEvent(new CustomEvent('openscroll:account',{detail:next}));
}
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export function hasAuthoringAccess(value:Account|null):boolean {
  return !!value&&value.verified&&value.approvalStatus==='approved';
}
export function authorizedHeaders(initial?:HeadersInit) {
  const headers=new Headers(initial);headers.set('x-openscroll-request','1');
  if(csrf)headers.set('x-csrf-token',csrf);
  return headers;
}
/** Shared by JSON and binary requests so protected tools receive the same session/CSRF headers. */
export async function authorizedFetch(path:string,options:RequestInit={}):Promise<Response> {
  if(!path.startsWith('/api/'))throw new Error('Account requests must use this instance API.');
  const response=await fetch(path,{...options,credentials:'same-origin',headers:authorizedHeaders(options.headers)});
  if(response.status===401&&account)setAccount(null,null);
  return response;
}
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await authorizedFetch(path,{method,headers:body===undefined?undefined:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30_000)});
  const data=await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && account) setAccount(null,null);
    throw new ApiError(response.status,typeof data.error === 'string' ? data.error : 'The request failed. Please try again.');
  }
  return data as T;
}
export async function loadSession():Promise<Session> {
  const data=await api<Session>('/api/account/session');setAccount(data.author,data.csrf);return data;
}
