# Importing Rise 360 courses

OpenScroll imports a Rise 360 **web export** as an editable course. In Rise, choose **Publish**, then **Web**, and
download the ZIP. In OpenScroll's workspace, choose **Import a Rise 360 web export** and select that ZIP. The course
opens as an unsaved project with an import report; nothing is stored until you save a copy to your library or
download the `.openscroll` file. Operators can also import from the command line:

```sh
npm run project -- rise rise-export.zip course.openscroll
```

The command writes a new file, prints the report as JSON, and never changes the export.

## What is read

A Rise web export stores the course in `content/runtime-data.js` as base64-encoded JSON and its media in
`content/assets/`. The importer reads only those entries. The Rise player code in the ZIP is skipped unopened.
Uploads are limited to 64 MiB; each media file to 16 MiB; the resulting project to the usual
[format limits](FORMAT-SPEC.md#validation-and-limits). Paths with `..`, absolute paths, encrypted entries and
unsupported compression are refused. Every file's type is checked from its bytes, and the result passes the same
validation as any uploaded `.openscroll` project.

## How blocks map

| Rise | OpenScroll | Result |
| --- | --- | --- |
| Text: paragraph, paragraph with heading, heading, subheading | Paragraph, paragraph with heading, heading, subheading | Exact, with formatting |
| Statement B and Note | Note | Statement B is restyled as a Note |
| Statements A, C and D | Statement | Restyled |
| Quote | Quote | Exact |
| Numbered, bulleted and checkbox lists | List | Exact |
| Image (centered, full width, text aside) | Image or image and text | Needs alternative text |
| Accordion, tabs | Accordion, tabs | Exact |
| Process (introduction, steps, summary) | Process with introduction and summary cards | Exact |
| Flashcards (text sides) | Flashcards | Exact; image sides are reported |
| Timeline | Timeline with date labels | Exact |
| Sorting activity | Sort into groups (practice question) | Learners choose a group from a list instead of dragging |
| Knowledge check: multiple choice, multiple response | Practice question | Choices, answers and all feedback kept |
| Continue | Continue with its completion message | Exact |
| Divider, numbered divider, spacer | Divider, spacer | Exact |
| Attachment (PDF) | Attachment | Needs a description |
| Audio, video | Audio, video | Needs a transcript (and captions for video) |

Anything else, such as charts, scenarios, Storyline blocks, embeds and code blocks, is listed in the report under
**not imported** with its lesson and position, so it can be rebuilt by hand. Nothing is dropped silently.

The theme carries over: accent color, cover layout, serif or sans body text, the Lato and Merriweather pairing,
the cover image and the author's name and photo. Rise exports carry no alternative text, so the cover is marked
decorative and each lesson shows the cover as a decorative banner; change either in the course or lesson settings
if the image carries information. Images inside lessons are flagged for alternative text.

## Not carried over

Rise's AI Tutor and Review 360 settings, Articulate-hosted theme images, Rise's own tracking data, and course
features OpenScroll does not have yet. Graded Rise quizzes are not yet supported.

## Testing

`tests/rise-import.test.ts` builds a synthetic Rise-shaped export with original text; owners' real courses stay out
of the repository. To check fidelity against real exports locally, import each one with the command above and
compare the report's block counts with the source.
