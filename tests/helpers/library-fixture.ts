import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { sampleProject } from '../../src/project/sample.js';
import { assetPath } from '../../src/shared/course.js';
/** Set up editor fixtures without consuming the real, per-IP import rate budget. */
export async function seedSampleCourse(owner:string){
 const id=randomUUID(),project=sampleProject(),pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),client=await pool.connect();
 try{await client.query('BEGIN');await client.query('INSERT INTO courses(id,owner_id,document) VALUES($1,$2,$3)',[id,owner,project.document]);for(const asset of project.document.assets)await client.query('INSERT INTO course_assets(course_id,asset_id,data) VALUES($1,$2,$3)',[id,asset.id,Buffer.from(project.files[assetPath(asset)]!,'base64')]);await client.query('COMMIT');return id;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}
