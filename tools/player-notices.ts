import { readFile,writeFile } from 'node:fs/promises';
const notices=[['Zod · runtime validation','node_modules/zod/LICENSE'],['Vite · generated module preload helper','node_modules/vite/LICENSE.md']] as const;
const content=await Promise.all(notices.map(async([name,path])=>`${name}\n\n${await readFile(path,'utf8')}`));
await writeFile('dist/client/player-notices.txt',content.join('\n\n--------------------\n\n'));
