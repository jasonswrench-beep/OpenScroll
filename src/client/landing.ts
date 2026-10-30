import './style.css';
/** Preserve previously issued account links without sending tokens in URL queries. */
function forwardAccountLink() {
  const params=new URLSearchParams(location.hash.slice(1));
  const kind=params.has('reset')?'reset':params.has('verify')?'verify':undefined;
  const token=kind?params.get(kind):null;
  if(!kind||!token||!/^[a-f0-9]{64}$/.test(token))return;
  history.replaceState(null,'',location.pathname+location.search);
  location.replace(`/account/#${kind}=${token}`);
}
window.addEventListener('hashchange',forwardAccountLink);
forwardAccountLink();
