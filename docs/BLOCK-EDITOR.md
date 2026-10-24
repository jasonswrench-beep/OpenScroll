# Core block editor

Step 6 adds composition inside stored library courses. Sign in, open a course, and choose **Open lesson**. The lesson title and Jump to lesson control navigate the outline; the scrolling canvas edits the current lesson. Portable files must first be saved as a library copy to use this editor.

## Building a lesson

Use **Block library** for a searchable catalog with original visual previews and Text, Images, and Structure filters. **Insert block** between cards chooses that exact position. The quick insert row appends a paragraph, heading, image, or list. Inserting through the library advances its insertion point so several blocks can be added in sequence.

| Family | Templates and editable content |
| --- | --- |
| Heading | Heading, subheading; text |
| Paragraph | Plain, with heading; body and optional heading |
| Statement | Statement, note; text |
| Quote | Quotation and attribution |
| List | Bulleted, numbered, checklist; individual items, add/remove items |
| Image | Centered, full-width; image, caption, alternative text, decorative status |
| Image and text | Image left/right; image, caption, heading, body |
| Divider | Line, numbered; optional label |
| Spacer | Small, medium, large |
| Continue | Label and completion rule; learner gating is active in the Step 7 player |

Click text in the canvas to edit it in place. Version 1 stores plain text, including line breaks; there are no bold, italic, link, or arbitrary HTML marks. Pasted content is inserted as inert text. Text remains focused while typing rather than rebuilding the canvas on each keystroke. IME composition commits after composition ends.

Each card has labeled **Move up**, **Move down**, **Duplicate**, **Delete**, and **Settings** buttons. Reordering preserves IDs. Duplication creates a new block ID with independent content and retains referenced assets. Delete is immediate and undoable. The template dropdown offers compatible variants within the same block family. Switching preserves text, hidden fields, narration, appearance, and identity; it does not attempt a destructive cross-family conversion.

## Settings and images

Block settings choose reading/wide/full width, small/medium/large spacing, and page/soft surface/course accent backgrounds. Accent backgrounds select black or white text based on contrast. At narrow widths the library and settings stack above the canvas, and image/text layouts become one column.

Choose an existing image asset or upload PNG, JPEG, or WebP up to 16 MiB, within the project package limits. The browser checks the file signature and server validation checks the complete project and asset bytes. Meaningful images use alternative text; decorative images render with empty alternative text while retaining the stored description. Captions are editable in the canvas. Starter images and text are original OpenScroll content; no vendor artwork or screen captures are embedded.

Narration settings preserve an optional script, course language default, and speed. Existing narration metadata survives compatible edits. This step stores scripts only; it does not generate or play audio. Continue completion rules are authored data; the Step 7 player applies them in preview and HTML output, while the editor keeps every block visible.

## Undo, redo, and focus

Use **Undo** / **Redo**, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y inside the lesson editor. Consecutive typing in one field groups while input stays within 800 ms. Structural actions break the group; a new edit clears redo. History is separate per lesson and limited to 50 entries and approximately 16 MiB of serialized snapshots per lesson. It covers block content/settings/order, not course metadata, lesson titles, section operations, or deleted lessons.

History belongs to the open editor session. Changing lessons retains that session's history; reopening/reloading the course or restoring a recovery draft starts fresh. History is not exported or saved as project revisions. Assets remain in the course inventory when a block is deleted, an upload replaced, or an insertion undone so redo, other references, and downloads remain valid. Asset cleanup is future work.

All operations have native keyboard controls. Library opening focuses search. Escape closes a panel and returns focus to its opener or selected card. Insertions focus their first editable field; reorder/duplicate/delete return focus to an appropriate card. Undo/redo restores the edited field where possible. Image reads temporarily prevent leaving the course/lesson or using history until the bytes are ready.

## Saving and implementation

Block edits use the existing serialized autosave, revision checks, owner isolation, conflict choices, and IndexedDB recovery described in [course organization](COURSE-ORGANIZATION.md). Documents and new asset bytes commit atomically. A conflict never silently overwrites another tab. Download outline project includes the current edited blocks and retained assets as an editable `.openscroll` file.

Step 9 now writes portable schema version 3 and migrates v1/v2 on copies; no new database migration or dependency is needed. See [media and interactions](MEDIA-AND-INTERACTIONS.md) for the additional block families. `src/shared/block-catalog.ts` owns defaults and compatible variants; `src/shared/block-renderer.ts` and `blocks.css` render semantic content without requiring editor controls. The editor supplies plain-text binding and wraps content with controls. Step 7 uses this renderer for [learner preview and HTML publishing](HTML-PUBLISHING.md). SCORM and PDF publishing remain later work.

Automated Chromium/axe checks cover all core templates, panel labeling, keyboard focus, and narrow reflow. Manual NVDA/VoiceOver and Firefox/Safari testing remain release work; automated checks are not a claim of complete WCAG conformance.
