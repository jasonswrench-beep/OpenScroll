import { importOpenAssess, OPENASSESS_LIMIT } from '../project/openassess-import.js';
import {readQuestionFile,questionCsvTemplate,questionXlsxTemplate,QUESTION_FILE_LIMIT} from '../project/question-spreadsheet.js';
import { exportPdf } from '../project/pdf-export.js';
import { z } from 'zod';
import { exportScorm } from '../project/scorm-export.js';
import { resolve } from 'node:path';
import { exportHtml } from '../project/html-export.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { exportProject, importProject, LIMITS } from '../project/archive.js';
import { sampleProject } from '../project/sample.js';
import { importRiseExport, RISE_LIMITS } from '../project/rise-import.js';
import { ProjectError } from '../shared/course.js';
import { HttpError } from './accounts/access.js';
import { requestBytes } from '../shared/limits.js';
import { instanceSizeLimits } from './config.js';
import { installLargeRequestSlot, claimLargeRequest } from './large-requests.js';

export async function projectRoutes(app: FastifyInstance,options:{playerRoot?:string}) {
  // A whole course as JSON (every file in base64), sized from this instance's course limit.
  const courseRequest=requestBytes(instanceSizeLimits());
  app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:QUESTION_FILE_LIMIT},(_request,body,done)=>done(null,body));
  app.addContentTypeParser('application/x-openscroll-project', { parseAs: 'buffer', bodyLimit: LIMITS.archive }, (_request,body,done) => done(null,body));
  app.addContentTypeParser('application/zip', { parseAs: 'buffer', bodyLimit: RISE_LIMITS.upload }, (_request,body,done) => done(null,body));
  app.decorateRequest('projectProcessing', false);
  // Every project request owns the process's large-request slot through body parsing and archive work, shared with
  // the library's large saves and imports (large-requests.ts), so only one whole course is in memory at a time.
  installLargeRequestSlot(app);
  const release = (request: FastifyRequest) => { app.largeRequests.release(request.id); };
  async function processFile<T>(request: FastifyRequest, operation: () => Promise<T>) {
    request.projectProcessing = true;
    try { return await operation(); } finally { release(request); }
  }
  app.addHook('onRequest', async (request,reply) => {
    if (!claimLargeRequest(app, request, reply, 'Another project file is being processed. Please try again.')) return reply;
    reply.header('Cache-Control','no-store');
  });
  app.addHook('onResponse', async request => { release(request); });
  app.addHook('onRequestAbort', async request => { if (!request.projectProcessing) release(request); });
  app.addHook('onTimeout', async request => { if (!request.projectProcessing) release(request); });
  app.setErrorHandler((error,_request,reply) => {
    if(error instanceof HttpError)return reply.code(error.statusCode).send({error:error.message});
    if (error instanceof ProjectError) return reply.code(422).send({ error: error.message });
    const code = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    if (code === 413) return reply.code(413).send({ error: 'The project upload exceeds the size limit.' });
    if (code === 400 || code === 415) return reply.code(code).send({ error: 'The project request has an invalid body or content type.' });
    return reply.code(500).send({ error: 'The project file could not be processed.' });
  });
  app.get('/questions/template.csv',async(_request,reply)=>reply.type('text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="openscroll-question-template.csv"').send(questionCsvTemplate()));
  app.get('/questions/template.xlsx',async(request,reply)=>reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition','attachment; filename="openscroll-question-template.xlsx"').send(await processFile(request,questionXlsxTemplate)));
  app.post('/questions/import',{bodyLimit:QUESTION_FILE_LIMIT},async request=>{
    const query=z.strictObject({format:z.enum(['csv','xlsx'])}).safeParse(request.query);
    if(!query.success||!Buffer.isBuffer(request.body))throw new ProjectError('Upload a CSV or .xlsx file and specify its format.');
    return processFile(request,()=>readQuestionFile(request.body as Buffer,query.data.format));
  });
  app.get('/sample', async (request,reply) => reply.type('application/x-openscroll-project').header('Content-Disposition','attachment; filename="welcome.openscroll"').send(await processFile(request, () => exportProject(sampleProject()))));
  app.post('/import', { bodyLimit: LIMITS.archive }, async request => {
    if (!Buffer.isBuffer(request.body)) throw new ProjectError('Upload a binary .openscroll project file.');
    return processFile(request, () => importProject(request.body as Buffer));
  });
  // A Rise web export becomes an unsaved portable project plus a mapping report; nothing is stored.
  app.post('/import-rise', { bodyLimit: RISE_LIMITS.upload }, async request => {
    if (!Buffer.isBuffer(request.body)) throw new ProjectError('Upload a Rise web export ZIP.');
    return processFile(request, () => importRiseExport(request.body as Buffer));
  });
  // An OpenAssess bank becomes questions for a course question bank plus a report; nothing is stored.
  app.post('/import-openassess', { bodyLimit: OPENASSESS_LIMIT }, async request => {
    if (!Buffer.isBuffer(request.body)) throw new ProjectError('Upload an OpenAssess question bank (.openassess).');
    return processFile(request, () => importOpenAssess(request.body as Buffer));
  });
  for(const [path,edition]of [['scorm-12','1.2'],['scorm-2004','2004']] as const)app.post('/'+path,{bodyLimit:courseRequest},async(request,reply)=>reply.type('application/zip').header('Content-Disposition',`attachment; filename="course-${path}.zip"`).send(await processFile(request,()=>exportScorm(request.body,options.playerRoot ?? resolve('dist/client'),edition))));
  app.post('/pdf',{bodyLimit:courseRequest},async(request,reply)=>{
    const parsed=z.strictObject({project:z.unknown(),options:z.unknown().optional()}).safeParse(request.body);
    if(!parsed.success)throw new ProjectError('Send a course project and PDF options.');
    return reply.type('application/pdf').header('Content-Disposition','attachment; filename="course.pdf"').send(await processFile(request,()=>exportPdf(parsed.data.project,parsed.data.options)));
  });
  app.post('/html', { bodyLimit:courseRequest }, async (request,reply) => reply.type('application/zip').header('Content-Disposition','attachment; filename="course-html.zip"').send(await processFile(request,()=>exportHtml(request.body,options.playerRoot ?? resolve('dist/client')))));
  app.post('/export', { bodyLimit: courseRequest }, async (request,reply) => reply.type('application/x-openscroll-project').header('Content-Disposition','attachment; filename="course.openscroll"').send(await processFile(request, () => exportProject(request.body))));
}
declare module 'fastify' { interface FastifyRequest { projectProcessing: boolean; } }
