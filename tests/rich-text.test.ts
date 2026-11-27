import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRich, isCanonicalRich, plainToRich, richToPlain, richHtml, richIsEmpty } from '../src/shared/rich-text.js';

test('plain single-paragraph text is already canonical rich text', () => {
  for (const value of ['', 'Hello world', 'Learning grows through ____.', 'It’s “quoted” and fine.', 'Café 100%'])
    assert.equal(isCanonicalRich(value), true, value);
  for (const value of ['a < b', 'Fish & chips', 'two  spaces', ' leading', 'line\nbreak'])
    assert.equal(isCanonicalRich(value), false, value);
});

test('plain text converts losslessly in meaning', () => {
  assert.equal(plainToRich('Fish & chips < 5'), 'Fish &amp; chips &lt; 5');
  assert.equal(plainToRich('First paragraph.\n\nSecond paragraph.'), '<p>First paragraph.</p><p>Second paragraph.</p>');
  assert.equal(plainToRich('Line one\nLine two'), 'Line one<br>Line two');
  assert.equal(plainToRich('   \n\n  '), '');
  assert.equal(richToPlain(plainToRich('a\n\nb & c')), 'a\n\nb & c');
});

test('Rise-style markup becomes the canonical subset', () => {
  const rise = '<div data-editor-id="x"><p><strong>Tip:</strong> Know your reader&nbsp;well.</p></div>';
  assert.equal(sanitizeRich(rise), '<strong>Tip:</strong> Know your reader well.');
  const two = '<div data-editor-id="a"><h2>Heading</h2><p>Body <span style="color:red">text</span> <em>here</em>.</p><ol start="3"><li><p>Item</p></li></ol></div>';
  assert.equal(sanitizeRich(two), '<h3>Heading</h3><p>Body text <em>here</em>.</p><ol start="3"><li>Item</li></ol>');
  assert.equal(sanitizeRich('<p><b>bold</b> and <i>italic</i></p>'), '<strong>bold</strong> and <em>italic</em>');
  assert.equal(sanitizeRich('<a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener">link</a>'), '<a href="https://example.org/a?b=1&amp;c=2">link</a>');
});

test('unsafe or unsupported markup never survives', () => {
  const cases = [
    '<script>alert(1)</script>Safe',
    '<img src=x onerror=alert(1)>Safe',
    '<a href="javascript:alert(1)">Safe</a>',
    '<a href="https://user:pw@example.org">Safe</a>',
    '<iframe src="https://example.org"></iframe>Safe',
    '<p onclick="x()">Safe</p>',
    '<style>p{}</style>Safe',
    '<svg><script>alert(1)</script></svg>Safe',
    '<!-- comment -->Safe',
    '<p>Safe<',
  ];
  for (const input of cases) {
    const output = sanitizeRich(input);
    assert.doesNotMatch(output, /script|onerror|onclick|javascript|iframe|style|svg|img|user:pw/i, input);
    assert.match(output, /Safe/, input);
    assert.equal(sanitizeRich(output), output, `idempotent for ${input}`);
  }
  assert.equal(sanitizeRich('<a href="javascript:alert(1)">x</a>'), 'x');
  assert.equal(sanitizeRich('5 < 6 & 7 > 3'), '5 &lt; 6 &amp; 7 &gt; 3');
});

test('sanitizing is idempotent across a range of messy inputs', () => {
  const inputs = [
    '<p>  spaced   <strong> bold </strong>  text </p>',
    '<strong>a</strong><strong>b</strong>',
    '<p>one<br><br>two<br></p><p></p>',
    '<ul><li>a<ul><li>b<ul><li>c<ul><li>d</li></ul></li></ul></li></ul></li></ul>',
    'text <p>para</p> tail',
    '<li>orphan</li>',
    '<h5>small</h5><h1>big</h1>',
    '<em><strong>both</strong></em> <a href="https://a.example"><a href="https://b.example">nested</a></a>',
    '&lt;not a tag&gt; &amp;amp; &#x1F600; &#0; &bogus;',
    '<table><tr><td>cell</td><td>cell 2</td></tr></table>',
  ];
  for (const input of inputs) {
    const once = sanitizeRich(input);
    assert.equal(sanitizeRich(once), once, input);
    assert.equal(isCanonicalRich(once), true, input);
  }
  assert.equal(sanitizeRich('<strong>a</strong><strong>b</strong>'), '<strong>ab</strong>');
  assert.equal(sanitizeRich('<ul><li>a<ul><li>b<ul><li>c<ul><li>d</li></ul></li></ul></li></ul></li></ul>').match(/<ul>/g)!.length, 3, 'lists nest at most three deep');
});

test('plain text, emptiness, and output HTML helpers', () => {
  const value = '<h3>Steps</h3><ol><li>First</li><li>Second</li></ol><p>See <a href="https://example.org">the guide</a>.</p>';
  assert.equal(isCanonicalRich(value), true);
  assert.equal(richToPlain(value), 'Steps\n\n1. First\n2. Second\n\nSee the guide.');
  assert.equal(richIsEmpty('<p> </p>'), true);
  assert.equal(richIsEmpty(''), true);
  assert.match(richHtml(value), /<a href="https:\/\/example.org" rel="noopener noreferrer">the guide<\/a>/);
  assert.equal(richHtml('Plain & simple', { paragraphTag: 'span' }), 'Plain &amp; simple');
  assert.equal(richHtml('Plain'), '<p>Plain</p>');
});
