import './style.css';
import {api,account,hasAuthoringAccess,loadSession,setAccount,type Account} from './account-api.js';
const status=document.querySelector<HTMLElement>('#account-status')!;
const signedOut=document.querySelector<HTMLElement>('#signed-out')!;
const signedIn=document.querySelector<HTMLElement>('#signed-in')!;
const register=document.querySelector<HTMLFormElement>('#register-form')!;
const access=document.querySelector<HTMLElement>('#account-access')!;
const openAuthoring=document.querySelector<HTMLAnchorElement>('#open-authoring')!;
const ownerPanel=document.querySelector<HTMLElement>('#owner-accounts-panel')!;
const ownerList=document.querySelector<HTMLElement>('#owner-account-list')!;
const ownerStatus=document.querySelector<HTMLElement>('#owner-accounts-status')!;
const more=document.querySelector<HTMLButtonElement>('#owner-accounts-more')!;
const refresh=document.querySelector<HTMLButtonElement>('#owner-accounts-refresh')!;
const message=(error:unknown)=>error instanceof Error?error.message:'The request failed. Try again.';
interface ManagedAccount {id:string;email:string;name:string;role:'owner'|'author';approvalStatus:'pending'|'approved'|'revoked';verified:boolean;disabled:boolean;createdAt:string;notificationStatus?:'pending'|'sending'|'sent'|'failed'|null;}
const verifyForm=document.querySelector<HTMLFormElement>('#verify-form')!;
let nextCursor:string|undefined,ownerGeneration=0,resetToken:string|undefined,verifyToken:string|undefined;
function isOwner(){return !!account&&hasAuthoringAccess(account)&&account.role==='owner';}
async function session(){
  const data=await loadSession();register.hidden=!data.registrationEnabled;
  document.querySelector<HTMLElement>('#register-password-fields')!.hidden=data.verificationRequired;
  document.querySelector<HTMLInputElement>('#register-password')!.disabled=data.verificationRequired;
  document.querySelector('#registration-policy')!.textContent=data.registrationEnabled
    ?`You can request an account on this instance. ${data.verificationRequired?'Verify your email and choose a password, then wait for its owner to approve authoring access.':'Its owner must approve authoring access.'}`
    :'New account requests are closed on this instance. Existing authors can sign in.';
}
function renderAccount(){
  signedIn.hidden=!account;signedOut.hidden=!!account;
  document.querySelector('#signed-in-name')!.textContent=account?`Signed in as ${account.name} (${account.email})`:'';
  access.dataset.approvalStatus=account?.approvalStatus??'';access.dataset.role=account?.role??'';
  openAuthoring.hidden=!hasAuthoringAccess(account);
  access.textContent=!account?'':!account.verified?'Verify your email before authoring access can be used.':account.approvalStatus==='pending'
    ?'Your account is waiting for this instance owner’s approval. Authoring tools are locked until access is approved. After approval, sign in again.'
    :account.approvalStatus==='revoked'?'Authoring access on this instance has been revoked. Contact its owner if you need access again.'
    :account.role==='owner'?'You are an owner of this instance. You can author courses and review account access below.':'Your authoring access on this instance is approved.';
  ownerPanel.hidden=!isOwner();
  if(!isOwner()){ownerGeneration++;ownerList.replaceChildren();nextCursor=undefined;more.hidden=true;}
}
function managedRow(person:ManagedAccount){
  const row=document.createElement('li');row.className='course-card';row.dataset.accountId=person.id;
  const heading=document.createElement('h3');heading.textContent=person.name;
  const email=document.createElement('p');email.textContent=person.email;
  const state=document.createElement('p');state.textContent=`${person.role==='owner'?'Instance owner':'Author'} · ${person.approvalStatus} · ${person.verified?'Email verified':'Email unverified'}${person.disabled?' · Disabled':''}`;
  const created=document.createElement('p');created.textContent=`Requested ${new Date(person.createdAt).toLocaleString()}`;
  const controls=document.createElement('div');controls.className='course-actions';
  function action(kind:'approve'|'revoke',label:string,disabled:boolean){
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.dataset.action=kind;button.setAttribute('aria-label',`${label}: ${person.name} (${person.email})`);button.disabled=disabled;
    button.addEventListener('click',async()=>{
      if(kind==='revoke'&&!confirm(`Revoke authoring access for ${person.name}? This signs them out. Their courses remain private and unchanged.`))return;
      const previous=[...controls.querySelectorAll('button')].map(control=>({control,disabled:control.disabled}));
      for(const {control} of previous)control.disabled=true;
      try{
        const result=await api<{message:string}>(`/api/owner/accounts/${person.id}/${kind}`,'POST',{});
        await loadAccounts();ownerStatus.textContent=result.message;
      }catch(error){ownerStatus.textContent=message(error);}
      finally{for(const {control,disabled} of previous)if(control.isConnected)control.disabled=disabled;}
    });controls.append(button);
  }
  if(person.approvalStatus!=='approved')action('approve',person.role==='owner'?'Approve access':'Approve author',!person.verified||person.disabled);
  if(person.approvalStatus!=='revoked')action('revoke','Revoke access',person.id===account?.id);
  row.append(heading,email,state,created);
  if(person.approvalStatus==='pending'&&person.notificationStatus==='failed'){
    const notice=document.createElement('p');notice.textContent='The owner notification email could not be delivered. This account can still be reviewed here.';row.append(notice);
  }
  row.append(controls);return row;
}
async function loadAccounts(append=false){
  if(!isOwner())return;
  const generation=++ownerGeneration;refresh.disabled=true;more.disabled=true;ownerStatus.textContent='Loading account access requests…';
  try{
    const cursor=append&&nextCursor?`?cursor=${encodeURIComponent(nextCursor)}`:'';
    const result=await api<{accounts:ManagedAccount[];nextCursor?:string}>(`/api/owner/accounts${cursor}`);
    if(generation!==ownerGeneration||!isOwner())return;
    if(!append)ownerList.replaceChildren();
    for(const person of result.accounts)ownerList.append(managedRow(person));
    nextCursor=result.nextCursor;more.hidden=!nextCursor;
    ownerStatus.textContent=ownerList.children.length?`${ownerList.children.length} accounts shown.`:'No account requests yet.';
    if(location.hash==='#requests')document.querySelector<HTMLElement>('#requests')!.focus();
  }catch(error){if(generation===ownerGeneration)ownerStatus.textContent=message(error);}
  finally{refresh.disabled=false;more.disabled=false;}
}
window.addEventListener('openscroll:account',()=>{renderAccount();if(isOwner())void loadAccounts();});
refresh.addEventListener('click',()=>{void loadAccounts();});more.addEventListener('click',()=>{void loadAccounts(true);});
for(const [id,path]of [['login-form','login'],['register-form','register'],['reset-request-form','request-reset'],['verify-request-form','resend-verification']] as const){
  document.querySelector<HTMLFormElement>(`#${id}`)!.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget as HTMLFormElement,submit=form.querySelector<HTMLButtonElement>('button')!;submit.disabled=true;
    try{
      const data=await api<{author?:Account;csrf?:string;message?:string}>(`/api/account/${path}`,'POST',Object.fromEntries(new FormData(form)));
      if(data.author&&data.csrf){
        setAccount(data.author,data.csrf);status.textContent=hasAuthoringAccess(data.author)?'Signed in. Your authoring access is approved.':'Signed in. Your account is waiting for owner approval.';
        if(hasAuthoringAccess(data.author)&&!(isOwner()&&location.hash==='#requests'))location.assign('/app/');
        else if(!isOwner())access.focus();
      }
      else status.textContent=data.message??'Request completed.';
      form.reset();
    }catch(error){status.textContent=message(error);}
    finally{submit.disabled=false;}
  });
}
document.querySelector('#logout')!.addEventListener('click',async()=>{
  try{await api('/api/account/logout','POST',{});setAccount(null,null);status.textContent='Signed out.';document.querySelector<HTMLElement>('#login-email')!.focus();}
  catch(error){status.textContent=message(error);}
});
async function readAccountLink(){
  const params=new URLSearchParams(location.hash.slice(1)),reset=params.get('reset'),verify=params.get('verify');
  if(!reset&&!verify){if(location.hash==='#requests'&&!account)status.textContent='Sign in as an instance owner to review account access requests.';return;}
  history.replaceState(null,'',location.pathname+location.search);
  if(reset){
    resetToken=reset;document.querySelector<HTMLElement>('#reset-form')!.hidden=false;
    document.querySelector<HTMLElement>('#new-password')!.focus();
  }else if(verify){
    verifyToken=verify;verifyForm.reset();verifyForm.hidden=false;
    document.querySelector<HTMLElement>('#verify-password')!.focus();
  }
}
verifyForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=verifyForm.querySelector<HTMLButtonElement>('button')!;
  button.disabled=true;
  try{
    const result=await api<{message:string}>('/api/account/verify','POST',{token:verifyToken,password:new FormData(verifyForm).get('password')});
    verifyToken=undefined;verifyForm.reset();verifyForm.hidden=true;status.textContent=result.message;
    document.querySelector<HTMLElement>(account?'#logout':'#login-email')!.focus();
  }catch(error){status.textContent=message(error);}
  finally{button.disabled=false;}
});
document.querySelector<HTMLFormElement>('#reset-form')!.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget as HTMLFormElement,button=form.querySelector<HTMLButtonElement>('button')!;button.disabled=true;
  try{
    const data=await api<{message:string}>('/api/account/reset','POST',{token:resetToken,password:new FormData(form).get('password')});
    resetToken=undefined;form.reset();form.hidden=true;setAccount(null,null);status.textContent=data.message;document.querySelector<HTMLElement>('#login-email')!.focus();
  }catch(error){status.textContent=message(error);}finally{button.disabled=false;}
});
window.addEventListener('hashchange',()=>{void readAccountLink();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
void session().then(async()=>{
  status.textContent=account?(hasAuthoringAccess(account)?'Signed in. Authoring access is approved.':'Signed in. Awaiting this instance owner’s approval.'):'Sign in or request an account. Authoring access requires this instance owner’s approval.';
  await readAccountLink();
}).catch(()=>{status.textContent='Account service unavailable. Reload to try again.';});
