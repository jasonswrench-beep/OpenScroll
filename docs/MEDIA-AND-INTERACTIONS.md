# Media and interactions

Step 8 adds galleries, audio, video, attachments, link buttons, accordions, tabs, flashcards, processes, timelines, and labeled graphics. They appear in the **Media** and **Interactive** block-library categories and use the same save, undo/redo, duplication, preview, and HTML publishing workflow as the core blocks.

## Authoring

Edit text directly in the lesson. Structured settings choose files, accessible image descriptions, marker positions, and item operations. In the editor, every panel, card answer, process step, and marker description is expanded for editing. Learner controls appear in preview and HTML output.

| Block | Content and settings |
| --- | --- |
| Image gallery | Responsive grid; image asset/upload, caption, alternative text, decorative status per image; add, remove, reorder up to 30 images |
| Audio | MP3/WAV upload or existing audio asset, title, readable transcript |
| Video | MP4 upload or existing video asset, title, descriptive transcript, caption language, timed WebVTT captions |
| Attachment | PDF/TXT upload or existing compatible asset, download label, description |
| Link button | Label and complete HTTP/HTTPS address; opens a new tab with a screen reader announcement |
| Accordion | Up to 50 expandable title/text items; add, remove, reorder |
| Tabs | Up to 50 titled text panels; add, remove, reorder |
| Flashcards | Up to 50 independent prompts/answers; add, remove, reorder |
| Process | Up to 50 titled steps with descriptions; add, remove, reorder |
| Timeline | Up to 50 ordered event titles/descriptions; add, remove, reorder |
| Labeled graphic | Image, caption, alternative text, and up to 30 label/description markers with numeric x/y positions from 0–100%; add, remove, reorder |

Collections retain at least one item. Text, marker labels, and captions use the portable plain-text model. Marker coordinates and native buttons provide a keyboard alternative to dragging. Use distinct labels, meaningful image descriptions, and marker positions that do not overlap. Gallery images and graphics start with original OpenScroll art that can be replaced.

Files are limited to 16 MiB each and the existing course inventory/package limits. Browser checks catch incorrect file signatures before adding bytes; server validation checks metadata, hashes, type, inventory, and references again. This is not a full media decoder or malware scan. Playback depends on the receiving browser's codecs; the tested MP4 uses H.264/AAC. No external video embeds, streaming provider, remote media fetch, or arbitrary HTML is introduced. Video files are uploaded as course-owned assets.

Uploaded assets remain in the inventory after replacement, removal, or undo, so existing references and redo remain valid. Library duplication remaps every nested gallery, graphic, audio, video, and attachment reference to the copied course's independent assets. A file read that finishes after its target content changed is rejected with a retry message rather than assigned to a different slot.

## Transcripts and captions

Add an accurate transcript to uploaded audio. Video needs a descriptive transcript covering speech and meaningful visual information, plus timed captions. Drafts can be saved before these are complete; HTML publishing rejects configured audio/video with a blank transcript or configured video without captions. Starter text is a prompt to replace, not an automatically generated transcript.

Paste plain WebVTT into **Timed captions**, then choose **Apply captions**, or import a `.vtt` file up to 1 MiB. Basic cue timing and plain text are supported; style/region blocks and cue-position settings are not. Invalid timing does not replace the saved captions. Clear captions is undoable. Example:

```text
WEBVTT

00:00.000 --> 00:02.500
Describe the spoken words or meaningful sound.
```

There can be 1–500 cues, with an end after each start, up to 24 hours. The player generates inert UTF-8 WebVTT for a native caption track. Audio/video have native controls, no autoplay, and a visible transcript. Playback failures display a transcript fallback. Generating narration, speech-to-text, and automatic captions remain outside this step.

Attachments download their original accepted bytes; they are not embedded as executable pages. Link addresses reject JavaScript, data/file schemes, and embedded credentials. A configured external link is an intentional external destination; it is not a dependency required to load or run the course.

## Learner and keyboard behavior

| Block | Behavior |
| --- | --- |
| Gallery | All images/captions remain readable; responsive columns collapse on narrow screens |
| Audio/video | Browser-native controls, accessible recording title, visible transcript, timed video captions |
| Attachment/link | Native keyboard-operable anchor; download or announced new tab |
| Accordion | Native details/summary; Enter/Space toggles each item |
| Tabs | Arrow Left/Right activates adjacent tabs; Home/End selects first/last; Tab enters the selected panel |
| Flashcards | A stable button reveals/hides each answer, with expanded state and an associated region |
| Process | Previous/Next step controls and announced step position; focus stays on an available control at the ends |
| Timeline | Semantic ordered list; every event is available without pointer interaction |
| Labeled graphic | Numbered, named marker buttons; Enter/Space toggles the associated description with expanded state |

Panel, card, step, marker, and playback state is transient. It resets when the player rebuilds a lesson, such as after navigation or marking content reviewed. It is isolated from authored content. Lesson completion and Continue review acknowledgements continue to resume as documented in [HTML publishing](HTML-PUBLISHING.md).

Continue rules still require an explicit **Mark as reviewed** acknowledgement for preceding content; opening every panel or finishing playback is not enforced. These acknowledgements are not an assessment or proof of comprehension. Step 9 adds optional all-item exploration requirements and assessment completion rules; see [assessments and completion](ASSESSMENTS-AND-COMPLETION.md).

## HTML and print compatibility

All new blocks use the shared renderer in preview and standalone HTML. Every uploaded asset is packaged with relative references. Timed captions are generated locally from saved cue data, so no captions service is required. The player retains its restrictive policy while permitting its own generated caption/media data URLs. Authoring code, account data, recovery drafts, and learner progress are excluded from publications.

| Block | Static print mapping |
| --- | --- |
| Gallery | Images followed by their captions |
| Audio | Title and complete transcript; playback control omitted |
| Video | Title and descriptive transcript; playback control omitted |
| Attachment | Description, label, and resource address |
| Link button | Label and destination address |
| Accordion/tabs | All titled explanations, including collapsed/inactive panels |
| Flashcards | Prompt followed by answer |
| Process/timeline | Every step/event in authored order |
| Labeled graphic | Image/caption followed by every marker label and description |

Print styles flatten the currently rendered blocks and omit interactive controls. They do not publish a PDF, add document tagging, or reveal blocks beyond an unopened Continue; a complete PDF mapping over the whole authored course is Step 11 work. No PDF accessibility claim is made.

## Portable compatibility

These media block types were introduced in portable schema version 2. Step 9 now writes **schema version 3**, with version 1/2 imports. Version 1 files are validated and migrated on a copy, preserving IDs, content, narration, and asset bytes. Original files stay unchanged; new downloads use version 3. Stored version 1 rows are normalized when read and become the current portable version only on an explicit save. Database migration 2 remains current; the database and portable format versions are independent.

Recovery drafts migrate local content while retaining exact pending request identity. The server recognizes an unchanged version 1 save acknowledgement created before the upgrade, without an extra revision or force overwrite. Modified/stale requests still conflict. Old OpenScroll builds can reject version 2 safely, so keep an original version 1 file if an older installation must continue editing it.

See [format specification](FORMAT-SPEC.md), [course recovery](COURSE-ORGANIZATION.md), and [Step 8 validation](STEP-8-VALIDATION.md). Manual screen reader review and non-Chromium playback remain pending.
