import nodemailer from 'nodemailer';
import { accountConfig } from './accounts/config.js';
const config=accountConfig();
if(config.mailMode!=='smtp')throw new Error('SMTP mode is required for this check.');
const transport=nodemailer.createTransport({...config.smtp,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
try{await transport.verify();console.log('SMTP connection, TLS and configured authentication succeeded. Delivery still requires a real verification/reset email test.');}catch{console.error('SMTP check failed. Check host, port, TLS and credentials.');process.exitCode=1;}finally{transport.close();}
