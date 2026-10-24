# Block compatibility matrix

All listed blocks use portable schema 3 and are editable, reusable and included in `.openscroll` projects. Preview, HTML, SCORM 1.2 and SCORM 2004 use the same learner renderer. HTML supports optional local resume; SCORM adds LMS tracking through its adapter. PDF provides a static reading version and no learner state.

| Block | Preview / HTML | SCORM 1.2 / 2004 | PDF |
| --- | --- | --- | --- |
| Heading | Semantic heading | Same | Heading |
| Paragraph | Paragraphs | Same | Paragraphs |
| List | Ordered/unordered list | Same | Ordered/unordered list |
| Statement | Emphasized text | Same | Emphasized text |
| Quote | Quote and attribution | Same | Quote and attribution |
| Image | Image, alternative text, caption | Same | Image, alternative text, caption |
| Image and text | Responsive composed layout | Same | Ordered image/text content |
| Divider | Visual separator | Same | Separator |
| Spacer | Visual spacing | Same | Spacing |
| Gallery | Images and captions | Same | All images and captions |
| Audio | Native playback and transcript | Same | Transcript; no playback |
| Video | Native playback, captions, transcript | Same | Transcript; no playback |
| Attachment | Download embedded file | Same | Filename/description; file not embedded |
| Button | Validated external link | Same | Link and destination |
| Accordion | Expandable panels | Same; exploration state resumes | All panel text expanded |
| Tabs | Keyboard-operated panels | Same; exploration state resumes | All panel text expanded |
| Flashcards | Reveal prompts/answers | Same; exploration state resumes | Front/back content |
| Process | Navigable steps | Same; exploration state resumes | All steps in order |
| Timeline | Ordered events | Same | All events in order |
| Labeled graphic | Image and selectable hotspots | Same; exploration state resumes | Image and numbered label descriptions |
| Assessment | Questions, feedback, retries, scoring | Same; aggregate score/status and resumable responses within LMS limits | Static questions; optional separate answer key |
| Continue | Completion/interaction gate | Same; LMS resume restores tracked state | Reading instruction; no gate |

Assessments include single/multiple choice, fill in the blank, matching and sorting. Answers are present in authored projects and interactive publications; these are learning tools, not secure examination delivery. PDF omits the answer key unless explicitly requested.

Themes apply across outputs: accent and font everywhere; reading width in web outputs and selected paper dimensions in PDF. Saved groups/layouts are ordinary block sequences and use these same mappings. Asset reuse never removes alternative text/transcript requirements. Unsupported/corrupt assets are rejected during project validation, not silently dropped at export.

See [HTML](HTML-PUBLISHING.md), [SCORM](SCORM-PUBLISHING.md), [PDF](PDF-PUBLISHING.md), and [assessment](ASSESSMENTS-AND-COMPLETION.md) guides for detailed behavior and limits. Automated Chromium checks do not establish full browser, assistive technology or PDF/UA conformance. Both SCORM editions passed the user's Brightspace acceptance; detailed tenant gradebook/resume/retake evidence remains unrecorded.
