export interface Account {id:string;email:string;name:string;}
export let account:Account|null=null;
let csrf:string|null=null;
export function setAccount(next:Account|null,token:string|null) {
  account=next;csrf=token;
  window.dispatchEvent(new CustomEvent('openscroll:account',{detail:next}));
}
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch(path,{method,headers:{'x-openscroll-request':'1',...(csrf ? {'x-csrf-token':csrf} : {}),...(body === undefined ? {} : {'Content-Type':'application/json'})},...(body === undefined ? {} : {body:JSON.stringify(body)}),signal:AbortSignal.timeout(30_000)});
  const data=await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && account) setAccount(null,null);
    throw new ApiError(response.status,typeof data.error === 'string' ? data.error : 'The request failed. Please try again.');
  }
  return data as T;
}
