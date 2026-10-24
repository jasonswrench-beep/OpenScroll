import type { RecoveryDraft } from './save-controller.js';
let connection:Promise<IDBDatabase>|undefined;
const cachedFiles=new Map<string,Record<string,string>>();
const keyFor=(owner:string,id:string)=>JSON.stringify([owner,id]);
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('openscroll-recovery',2);
    request.onupgradeneeded=()=>{
      for(const name of ['drafts','files'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);
    };
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();connection=undefined;};resolve(db);};
    request.onerror=()=>reject(request.error);
  });
}
export async function readDraft(owner:string,id:string):Promise<RecoveryDraft|undefined> {
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['drafts','files'],'readonly');
    const draft=tx.objectStore('drafts').get([owner,id]);const files=tx.objectStore('files').get([owner,id]);
    tx.oncomplete=()=>{
      const value=draft.result as RecoveryDraft|undefined;
      if(value && files.result)value.project.files=files.result as Record<string,string>;
      resolve(value);
    };
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function storeDraft(owner:string,id:string,draft:RecoveryDraft|null) {
  const db=await database();const key=keyFor(owner,id);const previous=cachedFiles.get(key);const files=draft?.project.files;
  const sameFiles=!!files && !!previous && Object.keys(files).length===Object.keys(previous).length && Object.entries(files).every(([path,data])=>previous[path]===data);
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['drafts','files'],'readwrite');
    if(draft){
      // Store large asset bytes separately; ordinary typing rewrites only the draft document.
      tx.objectStore('drafts').put({...draft,project:{document:draft.project.document,files:{}}},[owner,id]);
      if(!sameFiles)tx.objectStore('files').put(files,[owner,id]);
    }else{for(const name of ['drafts','files'])tx.objectStore(name).delete([owner,id]);}
    tx.oncomplete=()=>{if(files)cachedFiles.set(key,{...files});else cachedFiles.delete(key);resolve();};
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function clearOwnerDrafts(owner:string) {
  const db=await database();await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['drafts','files'],'readwrite');
    for(const name of ['drafts','files']){
      const cursor=tx.objectStore(name).openCursor();
      cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;if(Array.isArray(item.key) && item.key[0]===owner)item.delete();item.continue();};
    }
    tx.oncomplete=()=>{cachedFiles.clear();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
