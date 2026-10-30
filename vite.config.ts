import { defineConfig } from 'vite';
import { posix } from 'node:path';
export default defineConfig({
  // Vite injects development styles and an HMR client. Built publications retain the strict policy.
  plugins:[{name:'development-player-policy',apply:'serve',transformIndexHtml(html,context){
    return context.path==='/player.html' ? html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'') : html;
  },configureServer(server){
    server.middlewares.use(async(request,response,next)=>{
      const raw=request.url??'/';let path:string;
      try{
        if(!raw.startsWith('/')||raw.startsWith('//')||raw.includes('#'))throw new Error();
        const decoded=decodeURIComponent(raw.split('?')[0]!);
        if(/[\\\u0000?#%]/.test(decoded))throw new Error();
        path=posix.normalize(decoded).replace(/\/$/,'')||'/';
      }catch{
        response.statusCode=400;response.setHeader('Content-Type','text/plain; charset=utf-8');response.end('The request path is invalid.');return;
      }
      // Leave all API requests to the existing fixed backend proxy and its shared guard.
      if(path==='/api'||path.startsWith('/api/')){next();return;}
      const query=raw.includes('?')?raw.slice(raw.indexOf('?')):'';
      if(path.toLowerCase()==='/account'){
        request.url='/account.html'+query;next();return;
      }
      const name=posix.basename(path).toLowerCase();
      const page=path.toLowerCase()==='/app'||name==='app.html'?'app.html':name==='player.html'?'player.html':undefined;
      if(!page){next();return;}
      response.setHeader('Cache-Control','no-store');
      const signIn=()=>{response.statusCode=302;response.setHeader('Location','/account/');response.end();};
      try{
        const session=await fetch('http://127.0.0.1:3000/api/account/session',{
          headers:request.headers.cookie?{cookie:request.headers.cookie}:{},redirect:'error',signal:AbortSignal.timeout(3000)
        });
        if(session.status===401||session.status===403){signIn();return;}
        if(!session.ok)throw new Error();
        const data=await session.json();
        if(!data||typeof data!=='object'||!('author'in data))throw new Error();
        if(!data.author?.verified||data.author.approvalStatus!=='approved'){signIn();return;}
        request.url='/'+page+query;next();
      }catch{
        response.statusCode=503;response.setHeader('Content-Type','text/plain; charset=utf-8');response.end('Authoring access could not be checked. Try again shortly.');
      }
    });
  }}],
  build: { outDir: 'dist/client', manifest:true, rollupOptions:{input:{index:'index.html',account:'account.html',app:'app.html',player:'player.html'}} },
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    headers: { 'Cache-Control':'no-store' },
    proxy: { '/api': 'http://127.0.0.1:3000' } },
});
