import { api, setAccount, type Account } from './account-api.js';
const status=document.querySelector<HTMLElement>('#account-status')!;
const signedOut=document.querySelector<HTMLElement>('#signed-out')!;
const signedIn=document.querySelector<HTMLElement>('#signed-in')!;
const register=document.querySelector<HTMLFormElement>('#register-form')!;
const message=(error:unknown) => error instanceof Error ? error.message : 'The request failed. Try again.';
async function session() {
  const data=await api<{author:Account|null;csrf:string|null;registrationEnabled:boolean;verificationRequired:boolean}>('/api/account/session');
  register.hidden=!data.registrationEnabled;
  document.querySelector('#registration-policy')!.textContent=data.registrationEnabled ? (data.verificationRequired ? 'Registration is open. Verify your email before signing in.' : 'Registration is open on this instance.') : 'Registration is disabled on this instance.';
  setAccount(data.author,data.csrf);
}
window.addEventListener('openscroll:account',event => {
  const account=(event as CustomEvent<Account|null>).detail;
  signedIn.hidden=!account;signedOut.hidden=!!account;
  document.querySelector('#signed-in-name')!.textContent=account ? `Signed in as ${account.name} (${account.email})` : '';
});
for (const [id,path] of [['login-form','login'],['register-form','register'],['reset-request-form','request-reset'],['verify-request-form','resend-verification']] as const) {
  document.querySelector<HTMLFormElement>(`#${id}`)!.addEventListener('submit',async event => {
    event.preventDefault(); const form=event.currentTarget as HTMLFormElement;
    const submit=form.querySelector<HTMLButtonElement>('button')!;submit.disabled=true;
    try {
      const data=await api<{author?:Account;csrf?:string;message?:string}>(`/api/account/${path}`,'POST',Object.fromEntries(new FormData(form)));
      if (data.author && data.csrf) {setAccount(data.author,data.csrf);status.textContent='Signed in. Your private course library is ready.';document.querySelector<HTMLElement>('#library-title')!.focus();}
      else status.textContent=data.message ?? 'Request completed.';
      form.reset();
    } catch(error) {status.textContent=message(error);}
    finally {submit.disabled=false;}
  });
}
document.querySelector('#logout')!.addEventListener('click',async () => {
  if (!window.dispatchEvent(new CustomEvent('openscroll:before-signout',{cancelable:true}))) return;
  try {await api('/api/account/logout','POST');setAccount(null,null);window.dispatchEvent(new Event('openscroll:signed-out'));status.textContent='Signed out.';document.querySelector<HTMLElement>('#login-email')!.focus();}
  catch(error) {status.textContent=message(error);}
});
let resetToken:string|undefined;
function readAccountLink() {
  const params=new URLSearchParams(location.hash.slice(1));
  const reset=params.get('reset');const verify=params.get('verify');
  if (!reset && !verify) return;
  history.replaceState(null,'',location.pathname+location.search);
  if (reset) {
    resetToken=reset;document.querySelector<HTMLElement>('#reset-form')!.hidden=false;
    document.querySelector<HTMLInputElement>('#new-password')!.focus();
  } else if (verify) {
    void api<{message:string}>('/api/account/verify','POST',{token:verify}).then(data => {status.textContent=data.message;}).catch(error => {status.textContent=message(error);});
  }
}
document.querySelector<HTMLFormElement>('#reset-form')!.addEventListener('submit',async event => {
  event.preventDefault(); const form=event.currentTarget as HTMLFormElement; const button=form.querySelector('button')!;button.disabled=true;
  try {
    const data=await api<{message:string}>('/api/account/reset','POST',{token:resetToken,password:new FormData(form).get('password')});
    resetToken=undefined;form.reset();form.hidden=true;setAccount(null,null);status.textContent=data.message;
    document.querySelector<HTMLElement>('#login-email')!.focus();
  } catch(error) {status.textContent=message(error);} finally {button.disabled=false;}
});
window.addEventListener('hashchange',readAccountLink);
void session().then(readAccountLink).catch(() => {status.textContent='Account service unavailable. Check the connection and reload to try again.';});
