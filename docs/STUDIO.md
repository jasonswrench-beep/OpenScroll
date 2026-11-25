# OpenScroll Studio

OpenScroll Studio is the redesigned authoring workspace at `/studio/`. It is being built in stages (see the
[redesign plan](REDESIGN-PLAN.md) and the [block build plan](BLOCK-BUILD-PLAN.md)). The classic workspace at `/app/`
stays available and keeps every current tool while the studio grows; both work on the same library and the same
saved courses, so an author can move between them at any time.

## Turning it on

The studio is controlled by one instance setting:

| Setting | Values | Default |
|---|---|---|
| `OPENSCROLL_STUDIO` | `on` or `off` | `on` in development, `off` when `NODE_ENV=production` |

`deploy/compose.yaml` passes `OPENSCROLL_STUDIO=off` unless the operator sets it in `.env.production`. When it is
off, `/studio/` sends approved authors to the classic workspace and `GET /api/features` reports
`{"studio": false}`. Any other value stops the server at start-up with a clear message, so a typo cannot quietly
change what authors see. The setting changes only which pages are offered; the API, the library and the course
format are the same either way.

## What is in the studio now

- **Library**: course cards with cover, lesson and block counts, accent colour and last edit date; search, sort,
  and grid or list view (remembered per browser); a "Pick up where you left off" strip for the last course and
  lesson opened; New course (blank, from a template, from an `.openscroll` project, or from a Rise 360 export with
  its [import report](RISE-IMPORT.md)); and Rename, Duplicate, Download project and Delete for each course.
- **Course page**: the course cover rendered with the course theme, with the title and description edited in place;
  the lesson outline with sections, per-lesson block, interaction and question counts, inline titles, reordering
  that keeps keyboard focus on the moved row, Duplicate, Move to section and Delete; and a details panel for
  author, language, lesson order, pass mark, cover image and alt text, and theme (accent colour, cover layout,
  lesson header, body font, reading width).
- **Lesson editing**: Edit lesson opens the block editor inside the studio, with a lesson switcher and Back to
  course. The new lesson canvas replaces it in stage 4.
- **Saving**: the save button in the top bar always shows the true state (Saved, Changes pending, Saving, Save not
  confirmed, Conflict). Edits are revision-checked, kept in this browser as a recovery draft until the server
  confirms them, and never overwrite a change made in another tab: the conflict banner offers Download my edits,
  Save as a separate copy, or Reload saved course. Snapshots are one click away from the save button.
- **Export**: SCORM 1.2, SCORM 2004 4th Edition, website ZIP, PDF and editable project, all from the current edits.

## Addresses

| Address | Shows |
|---|---|
| `/studio/#library` | the library |
| `/studio/#course=<id>` | a course page |
| `/studio/#course=<id>&lesson=<lesson id>` | a lesson in the editor |

The browser Back button moves between these. Leaving a course with unconfirmed edits asks first.

## Accessibility

Every studio page has a skip link, one `h1`, labelled landmarks, visible focus, and announcements for saves and
list changes through a polite live region. Dialogs are native modal dialogs that return focus to the control that
opened them. Icon-only buttons carry text labels. The library and course page reflow to one column below 1200 px
and have no horizontal scrolling at 390 px. The browser checks in `tests/browser/studio.spec.ts` run axe
(WCAG 2.2 A and AA) on the library and the course page.
