import { createHash } from 'node:crypto';
import { parseCourse, type PortableProject } from '../shared/course.js';

// Original one-pixel PNG fixture. No third-party media is bundled.
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
export function sampleProject(): PortableProject {
  const appearance = { width: 'reading', padding: 'medium', background: 'page' };
  return {
    document: parseCourse({
      format: 'openscroll', schemaVersion: 3,
      course: {
        id: 'welcome-course', title: 'Welcome to OpenScroll', description: 'A portable course to explore, change, and reopen.', author: 'OpenScroll', language: 'en',
        createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z',
        cover: null,
        theme: { accentColor: '#193c35', font: 'sans', pageWidth: 'standard' },
        settings: { navigation: 'free', completion: 'all-lessons', passingScore: 80 },
        sections: [{ id: 'first-steps', title: 'First steps', lessons: [
          { id: 'your-course', title: 'Make it yours', blocks: [
            { id: 'welcome-heading', type: 'heading', variant: 'heading', appearance, content: { text: 'Start with one useful idea' } },
            { id: 'welcome-paragraph', type: 'paragraph', variant: 'plain', appearance, content: { heading: '', text: 'A course grows from small, purposeful pieces. Replace this text with something your learners need to know.' }, narration: { script: 'A course grows from small, purposeful pieces.', language: 'en', speed: 1 } },
            { id: 'sample-image-block', type: 'image', variant: 'centered', appearance, content: { assetId: 'sample-image', altText: '', decorative: true, caption: 'A tiny image fixture travels with this editable project.' } },
            { id: 'continue-block', type: 'continue', variant: 'button', appearance, content: { label: 'Continue' }, completion: 'none' },
          ] },
          { id: 'keep-your-work', title: 'Keep your work', blocks: [
            { id: 'ownership-list', type: 'list', variant: 'bulleted', appearance, content: { items: ['Download the editable project.', 'Keep the file somewhere safe.', 'Import it to continue working.'] } },
            { id: 'ownership-quote', type: 'quote', variant: 'plain', appearance, content: { text: 'Your ideas should travel with you.', attribution: 'OpenScroll starter course' } },
          ] },
        ] }],
      },
      assets: [{ id: 'sample-image', fileName: 'sample-image.png', mediaType: 'image/png', byteLength: image.length, sha256: createHash('sha256').update(image).digest('hex') }],
    }),
    files: { 'assets/sample-image.png': image.toString('base64') },
  };
}
