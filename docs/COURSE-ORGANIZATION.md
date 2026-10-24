# Course organization and autosave

Step 5 adds a stored-course outline editor. Sign in, find a course in the library, and choose **Open**. Create a blank library course first, or save a portable project as a library copy.

## Course outline

Edit the course title, description, displayed author, and language. Choose an existing image as the cover, upload a PNG/JPEG/WebP image up to 16 MiB, or select No cover. Alternative text and decorative status are stored on the cover usage. Empty descriptions, titles, sections, and lessons are valid drafts; invalid format fields are rejected with a message.

The cover upload is checked before entering the draft and validated again on the server. Documents and asset bytes commit together. Removing/changing a cover keeps the previous asset in the course inventory because a lesson may still reference it. This step does not introduce asset garbage collection.

Sections and lessons support add, rename, duplicate, delete, and move up/down. A lesson can also move to another section. Duplication creates fresh section/lesson/block IDs while preserving content, narration, and referenced course assets. Reordering preserves identity. Delete confirmations explain the content being removed; there is no undo for these structural actions in this step. Download a project before deleting content you may want later.

Open a lesson to change its title and compose its blocks, then return to the outline. Step 6 adds the [core block editor](BLOCK-EDITOR.md), with session-local block undo/redo. Navigation selection is not learner progress and is not stored in the portable course.

## Autosave states

| State | Meaning and action |
| --- | --- |
| Saved | The server acknowledged the current edits |
| Unsaved changes | Changes are waiting for the short autosave debounce |
| Saving | One save is in flight; newer edits are retained and queued |
| Save not confirmed | The request failed or its response was lost; edits stay local; use Retry save |
| Conflict | The saved course advanced since this editor's revision; automatic writes stop |

Autosave waits approximately 600 ms after editing. Saves are serialized, and ordinary metadata saves omit asset bytes. A new/changed asset inventory includes the complete validated files for an atomic update. The server controls the saved update timestamp and protects course identity and creation date.

**Save now** bypasses the debounce but does not bypass conflict checks. A failed save never becomes Saved just because the request was sent. Continuing to type after an error preserves the latest local draft; retry first resolves the exact pending request before sending later edits.

## Multi-tab conflicts and recovery

Each stored course has a revision outside the portable file format. Outline saves, library renames, and library deletions must supply the revision they read. A stale request returns HTTP 409 without overwriting the newer course. Another author's resource still returns 404.

In a conflict, choose one of these actions:

- **Download outline project** preserves the local edits as an editable file.
- **Save outline as separate copy** preserves local edits in a new library record with independent assets.
- **Reload saved course** fetches the current server course and, after confirmation, discards this outline's unsaved draft.

There is no force-overwrite or automatic merge. Refresh library listings before renaming/deleting a course changed by an open editor. Opening the same course again focuses its existing editor; use Reload saved course to intentionally replace it.

Each logical outline save includes a unique mutation ID. The server records its digest and result. If a response is lost after commit, retrying the identical request returns that acknowledgement without another revision. Reusing the ID with different content or after another write cannot overwrite data.

## Browser recovery drafts

Unsaved outlines and pending request identity are saved to IndexedDB, scoped by author and internal course ID. Asset bytes are stored separately so ordinary typing updates the recovery document rather than repeatedly rewriting every media file. This recovery schema is independent of the portable format and database migration versions.

After returning to a course, a recovery banner offers Restore or Discard. Restoring does not immediately write to the server. Choose Retry save if the base revision is still valid (including a lost acknowledgement from the same pending save). Otherwise the restored draft remains in conflict until downloaded, saved as a separate copy, or discarded in favor of the server course. Downloads/copies made while the recovery banner is present preserve the recovery draft.

Successful confirmation of all edits clears the recovery draft. Back to library warns before leaving unsaved work and keeps it for recovery. Unloading warns while changes are unconfirmed. Voluntary sign-out warns and clears this author's recovery drafts in this browser; session expiration retains drafts for that same author to recover after signing in again. Other signed-in authors do not see them through the application.

Browser recovery is local, unencrypted device storage, not a server backup. Use a trusted browser/device. Quota, disabled storage, private-browsing restrictions, clearing site data, and closing a tab before a local write completes can prevent recovery. A storage failure displays a warning and does not block a valid server save. Keep the tab open or download a copy when recovery is unavailable. The app does not promise a complete offline workflow.

## Persistence and API

Database migration 2 adds `revision`, `last_save_id`, and `last_save_hash`; it preserves existing course documents and assets. Run `npm run db:migrate` before restarting updated application code. The database migration version is separate from the portable schema. Step 9 writes portable version 3 and supports non-destructive version 1/2 imports. Portable projects never carry server revisions or session data.

- `GET /api/library/courses/:id/edit`: owned `{ project, revision, lastMutationId }` snapshot.
- `PUT /api/library/courses/:id/document`: `{ revision, mutationId, document, files? }`; validates and atomically commits, returning `{ revision, updatedAt }`.
- Library course listing includes `revision`.
- Library rename requires `{ title, revision }`; delete requires `{ revision }`.

The portable GET/download endpoints retain their prior representation. Server validation checks inventory consistency when files are omitted, byte integrity when supplied, total package limits, references, and stable project identity. SQL row locking makes revision validation and asset/document updates one transaction. Idempotent replay is supported only for the most recent unchanged logical save; it is not a permanent request history or snapshot system.

## Accessibility and verification

All structural actions have labeled native buttons, including reordering and moving between sections. Destructive actions require confirmation. Structural rerenders return focus to the outline heading; lesson navigation and rename fields have keyboard focus routes. Save and error states use live status text rather than color alone. The current outline and responsive layout pass the Chromium/axe checks; manual NVDA/VoiceOver testing remains pending.
