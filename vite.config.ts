import { defineConfig } from 'vite';
export default defineConfig({
  // Vite injects development styles and an HMR client. Built publications retain the strict policy.
  plugins:[{name:'development-player-policy',apply:'serve',transformIndexHtml(html,context){
    return context.path==='/player.html' ? html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'') : html;
  }}],
  build: { outDir: 'dist/client', manifest:true, rollupOptions:{input:{index:'index.html',player:'player.html'}} },
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000' } },
});
