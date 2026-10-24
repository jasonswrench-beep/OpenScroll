import { TextDecoder } from 'node:util';
import { crc32 } from 'node:zlib';
import { posix } from 'node:path';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { XMLParser,XMLValidator } from 'fast-xml-parser';
import { ProjectError } from '../shared/course.js';
import { QUESTION_HEADERS,parseQuestionTable,type TableRow } from '../shared/question-import.js';
export const QUESTION_FILE_LIMIT=2*1024*1024;
function decode(bytes:Buffer,encoding='utf-8'){try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw new ProjectError('The file contains invalid text encoding. Save CSV as UTF-8 or upload an .xlsx workbook.');}}
export function csvRows(text:string,delimiter=','):TableRow[]{
 const rows:TableRow[]=[],cells:string[]=[];let field='',quoted=false,closed=false,line=1,start=1;
 const cell=()=>{cells.push(field);field='';closed=false;if(cells.length>32)throw new ProjectError(`Row ${start}: too many columns.`);};
 const row=()=>{cell();rows.push({row:start,cells:[...cells]});cells.length=0;if(rows.length>2000)throw new ProjectError('The file has too many rows. Import up to 500 questions.');};
 for(let i=0;i<text.length;i++){
  const c=text[i]!;if(c==='\0')throw new ProjectError('CSV contains an invalid null character.');
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else{field+=c;if(c==='\n')line++;}continue;}
  if(c==='"'){if(field||closed)throw new ProjectError(`Row ${start}: quotes must surround the complete field.`);quoted=true;}
  else if(c===delimiter)cell();else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row();line++;start=line;}
  else{if(closed)throw new ProjectError(`Row ${start}: unexpected text after a closing quote.`);field+=c;}
 }
 if(quoted)throw new ProjectError(`Row ${start}: a quoted field was not closed.`);if(field||cells.length||closed)row();return rows;
}
async function unzip(bytes:Buffer){return new Promise<Map<string,Buffer>>((resolve,reject)=>{
 yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(err,zip)=>{
  if(err||!zip){reject(new ProjectError('This is not a readable .xlsx workbook.'));return;}const files=new Map<string,Buffer>();let total=0,count=0,stopped=false;
  const fail=(message:string)=>{if(stopped)return;stopped=true;zip.close();reject(new ProjectError(message));};
  zip.on('error',()=>fail('The workbook archive is corrupt.'));zip.on('end',()=>{if(!stopped){stopped=true;resolve(files);}});
  zip.on('entry',(entry:yauzl.Entry)=>{
   const name=entry.fileName;if(++count>128||name.split('/').includes('..')||files.has(name)||name.includes('\\')||name.startsWith('/')||(entry.generalPurposeBitFlag&1)||![0,8].includes(entry.compressionMethod)||entry.uncompressedSize>4*1024*1024||total+entry.uncompressedSize>8*1024*1024){fail('The workbook exceeds size limits or contains an unsafe/unsupported entry.');return;}
   if(name.endsWith('/')){zip.readEntry();return;}
   if(/vbaproject\.bin$/i.test(name)){fail('Macro-enabled workbooks are not supported. Save as .xlsx.');return;}
   zip.openReadStream(entry,(error,stream)=>{if(error||!stream){fail('A workbook entry could not be read.');return;}const chunks:Buffer[]=[];let size=0,checksum=0;
    stream.on('data',(chunk:Buffer)=>{size+=chunk.length;total+=chunk.length;if(size>4*1024*1024||total>8*1024*1024){stream.destroy();fail('The expanded workbook exceeds 8 MiB.');return;}checksum=crc32(chunk,checksum);chunks.push(chunk);});stream.on('error',()=>fail('A workbook entry is corrupt.'));stream.on('end',()=>{if(stopped)return;if(size!==entry.uncompressedSize||checksum!==entry.crc32){fail('A workbook entry failed its integrity check.');return;}files.set(name,Buffer.concat(chunks));zip.readEntry();});
   });
  });zip.readEntry();
 });
});}
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,trimValues:false,processEntities:true,maxNestedTags:64,isArray:name=>['row','c','si','r','sheet','Relationship'].includes(name)});
function xml(files:Map<string,Buffer>,name:string){const data=files.get(name);if(!data)throw new ProjectError(`The workbook is missing ${name}.`);try{const text=decode(data);if(/<!\s*(DOCTYPE|ENTITY)/i.test(text)||XMLValidator.validate(text)!==true)throw new ProjectError('The workbook contains invalid or unsupported XML.');return parser.parse(text);}catch{throw new ProjectError('The workbook contains invalid or unsupported XML.');}}
function stringValue(node:any):string{if(node===undefined||node===null)return '';if(typeof node==='string')return node;if(typeof node==='number')return String(node);if(Array.isArray(node))return node.map(stringValue).join('');if(node.t!==undefined)return stringValue(node.t);if(node.r!==undefined)return stringValue(node.r);return stringValue(node['#text']);}
function column(address:string){const m=/^([A-Z]{1,3})([1-9][0-9]*)$/.exec(address);if(!m)throw new ProjectError('A workbook cell has an invalid address.');let index=0;for(const c of m[1]!)index=index*26+c.charCodeAt(0)-64;if(index>32)throw new ProjectError('The Questions sheet has data beyond the supported columns.');return {column:index-1,row:Number(m[2])};}
export async function readQuestionFile(bytes:Buffer,format:'csv'|'xlsx'){
 if(!bytes.length||bytes.length>QUESTION_FILE_LIMIT)throw new ProjectError('Choose a nonempty CSV or .xlsx file up to 2 MiB.');
 if(format==='csv'){
  const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';const text=decode(bytes,encoding).replace(/^\uFEFF/,'');let rows=csvRows(text);if(rows[0]?.cells.length===1&&rows[0].cells[0]!.includes(';'))rows=csvRows(text,';');return parseQuestionTable(rows,'CSV');
 }
 const files=await unzip(bytes);if(!files.has('[Content_Types].xml')||!files.has('_rels/.rels'))throw new ProjectError('This ZIP is not an Excel .xlsx workbook.');const workbook=xml(files,'xl/workbook.xml'),relations=xml(files,'xl/_rels/workbook.xml.rels');const sheets=(workbook.workbook?.sheets?.sheet??[]) as any[];const visible=sheets.filter(s=>!['hidden','veryHidden'].includes(s['@_state']));const sheet=visible.find(s=>s['@_name']?.toLowerCase()==='questions')??visible[0];if(!sheet)throw new ProjectError('The workbook has no visible Questions sheet.');
 const relation=(relations.Relationships?.Relationship??[]).find((r:any)=>r['@_Id']===sheet['@_id']);if(!relation||relation['@_TargetMode']==='External')throw new ProjectError('The Questions sheet relationship is invalid.');const target=relation['@_Target'] as string;if(typeof target!=='string'||target.includes('\\')||target.includes(':'))throw new ProjectError('The worksheet path is invalid.');const path=posix.normalize(target.startsWith('/')?target.slice(1):posix.join('xl',target));if(!path.startsWith('xl/worksheets/'))throw new ProjectError('The worksheet path is unsupported.');
 const shared=files.has('xl/sharedStrings.xml')?(xml(files,'xl/sharedStrings.xml').sst?.si??[]).map(stringValue):[];const worksheet=xml(files,path);const table:TableRow[]=[];const rowNumbers=new Set<number>();let cells=0;
 for(const row of worksheet.worksheet?.sheetData?.row??[]){const number=Number(row['@_r']);if(!Number.isSafeInteger(number)||number<1||rowNumbers.has(number)||table.length>=2000)throw new ProjectError('The worksheet has invalid, duplicate or excessive rows.');rowNumbers.add(number);const values:string[]=[];const seen=new Set<number>();
  for(const cell of row.c??[]){if(++cells>32000)throw new ProjectError('The worksheet has too many cells.');const at=column(cell['@_r']);if(at.row!==number||seen.has(at.column))throw new ProjectError(`Row ${number}: duplicate or mismatched cell address.`);seen.add(at.column);if('f'in cell)throw new ProjectError(`Row ${number}: formulas are not supported. Replace formulas with values.`);const type=cell['@_t'];let value='';if(type==='s'){const index=Number(cell.v);if(!Number.isInteger(index)||index<0||index>=shared.length)throw new ProjectError(`Row ${number}: invalid shared string.`);value=shared[index];}else if(type==='inlineStr')value=stringValue(cell.is);else if(type==='b'){if(!['0','1'].includes(cell.v))throw new ProjectError(`Row ${number}: invalid boolean cell.`);value=cell.v==='1'?'True':'False';}else if(type==='e')throw new ProjectError(`Row ${number}: fix the Excel error cell first.`);else if(!type||['n','str'].includes(type))value=stringValue(cell.v);else throw new ProjectError(`Row ${number}: unsupported cell type.`);values[at.column]=value;
  }table.push({row:number,cells:Array.from({length:values.length},(_,i)=>values[i]??'')});
 }
 table.sort((a,b)=>a.row-b.row);return parseQuestionTable(table,String(sheet['@_name']));
}
export const TEMPLATE_ROWS=[QUESTION_HEADERS,['Basics','100','MC','Which action supports learning?','Practice','Ignore feedback','Avoid reflection','','','A','Correct: practice helps.','Try again.','1'],['Basics','200','TF','Feedback can support learning.','','','','','','True','','','1'],['Basics','','MR','Select two useful learning habits.','Practice','Reflect','Ignore feedback','','','A|B','','','1'],['Basics','','FIB','Learning improves with ____.','','','','','','practice|reflection','','','1'],['Basics','','MATCH','Match each action to its meaning.','Notice | Identify what matters','Act | Try one useful step','','','','','','','1'],['Basics','','SORT','Put these steps in order.','Notice','Act','Reflect','','','A|B|C','','','1']];
export function questionCsvTemplate(){return '\uFEFF'+TEMPLATE_ROWS.map(row=>row.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';}
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export async function questionXlsxTemplate(rows:string[][]=TEMPLATE_ROWS){
 const zip=new yazl.ZipFile();const add=(name:string,text:string)=>zip.addBuffer(Buffer.from(text),name,{mtime:new Date('1980-01-01T00:00:00Z'),mode:0o100644});
 add('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
 add('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 add('xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>');
 add('xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
 add('xl/worksheets/sheet1.xml','<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="13" width="28" customWidth="1"/></cols><sheetData>'+rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((cell,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+escape(cell)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>');
 const chunks:Buffer[]=[];const output=new Promise<Buffer>((resolve,reject)=>{zip.outputStream.on('data',(chunk:Buffer)=>chunks.push(chunk));zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));zip.outputStream.on('error',reject);zip.on('error',reject);});zip.end();return output;
}
