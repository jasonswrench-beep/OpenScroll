# Original test fixtures

`welcome-v1.openscroll`, `welcome-v2.openscroll` and `welcome-v3.openscroll` preserve the original version 1, 2 and 3 starter packages for non-destructive migration checks (`tests/compatibility.test.ts`). The current generated starter is `examples/welcome.openscroll` (version 4).

`every-block-v4.openscroll` holds one of every block template and every course resource (glossary, question bank, character, certificate), with an interactive video checkpoint linked to a question. It was generated with `npx tsx tools/every-block-fixture.ts tests/fixtures/every-block-v4.openscroll` from the original starter content and `original-clip.mp4`. The compatibility test checks that it re-exports byte for byte, so a deliberate format change regenerates it (delete it first; the tool will not overwrite).

`original-tone.wav` and `original-clip.mp4` are original two-second fixtures: a 440 Hz tone, and a solid dark green rectangle with the same tone. They contain no third-party recordings, images, speech, or music. `original-resource.txt` is original test text. These fixtures are covered by the repository license.

They were generated with FFmpeg (not required to run the application or tests):

```sh
ffmpeg -f lavfi -i sine=frequency=440:duration=2 -c:a pcm_s16le original-tone.wav
ffmpeg -f lavfi -i color=c=0x193c35:s=320x180:d=2:r=24 -f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart original-clip.mp4
```

Question-import fixtures under `question-import/` retain the two CSVs supplied for this feature. `ai-basics-20.xlsx` is an independently generated Excel workbook containing the same question rows, with an Instructions sheet before Questions. These are authored test inputs, not learner state or account data.
