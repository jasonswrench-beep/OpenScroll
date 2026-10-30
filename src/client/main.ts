import './style.css';
import '../shared/blocks.css';
import './block-editor.css';
import {api,account,hasAuthoringAccess,loadSession,setAccount,authorizedFetch} from './account-api.js';
const status=document.querySelector<HTMLElement>('#account-status')!;
const content=document.querySelector<HTMLElement>('#authoring-content')!;
const help=document.querySelector<HTMLElement>('#access-help')!;
const logout=document.querySelector<HTMLButtonElement>('#logout')!;
const connection=document.querySelector<HTMLElement>('#connection-status')!;
const retry=document.querySelector<HTMLButtonElement>('#retry')!;
let ready=false;
function showAccess(){
  logout.disabled=!account;
  if(!account||!hasAuthoringAccess(account)){
    content.hidden=true;content.inert=true;help.hidden=false;
    status.textContent=account?.approvalStatus==='pending'?'Authoring access is waiting for this instance owner’s approval.':account?.approvalStatus==='revoked'?'Your authoring access has been revoked.':'Your session has ended. Sign in again to access your workspace.';
    if(ready){window.dispatchEvent(new Event('openscroll:signed-out'));location.replace('/account/');}
    return;
  }
  status.textContent=`Signed in as ${account.name} (${account.email}). Authoring access approved.`;
  help.hidden=true;
  if(ready){content.hidden=false;content.inert=false;}
}
window.addEventListener('openscroll:account',showAccess);
logout.addEventListener('click',async()=>{
  if(!window.dispatchEvent(new CustomEvent('openscroll:before-signout',{cancelable:true})))return;
  logout.disabled=true;
  try{
    await api('/api/account/logout','POST',{});setAccount(null,null);
    window.dispatchEvent(new Event('openscroll:signed-out'));location.assign('/account/');
  }catch(error){status.textContent=error instanceof Error?error.message:'Sign-out failed. Try again.';logout.disabled=false;}
});
async function checkConnection(){
  if(!hasAuthoringAccess(account))return;
  retry.disabled=true;connection.textContent='Checking the authoring service…';
  try{
    const response=await authorizedFetch('/api/health',{signal:AbortSignal.timeout(5000)});
    const body=await response.json();if(!response.ok||body.status!=='ready')throw new Error();
    connection.textContent='Connected. The authoring service and database are ready.';
  }catch{connection.textContent='The authoring service or database is unavailable. Try checking again.';}
  finally{retry.disabled=false;}
}
retry.addEventListener('click',()=>{void checkConnection();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
async function start(){
  try{
    await loadSession();
    if(!hasAuthoringAccess(account)){showAccess();location.replace('/account/');return;}
    // Editor modules have DOM/event side effects; load them only after access and CSRF are known.
    await Promise.all([import('./project-workspace.js'),import('./library.js'),import('./outline-editor.js')]);
    await loadSession();
    if(!hasAuthoringAccess(account)){showAccess();location.replace('/account/');return;}
    ready=true;showAccess();
    if(hasAuthoringAccess(account))void checkConnection();
  }catch{
    content.hidden=true;content.inert=true;help.hidden=false;logout.disabled=!account;
    status.textContent='Authoring access could not be checked. Return to your account and try again.';
  }
}
void start();
