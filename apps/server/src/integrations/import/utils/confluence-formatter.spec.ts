import {
  confluencePageId,
  formatConfluenceHtml,
  normaliseLanguage,
  parseConfluenceIndex,
  parseConfluencePage,
  appendUnreferencedAttachments,
  rewriteConfluenceLinks,
} from './confluence-formatter';

const PAGE = `<html><head><title>ENG : Design Notes</title></head><body>
<div id="main-header">
  <div id="breadcrumb-section"><ol id="breadcrumbs">
    <li class="first"><span><a href="index.html">Engineering</a></span></li>
    <li><span><a href="Engineering-Home_65538.html">Engineering Home</a></span></li>
    <li><span><a href="Architecture_65540.html">Architecture</a></span></li>
  </ol></div>
  <h1 id="title-heading" class="pagetitle"><span id="title-text"> Engineering : Design Notes </span></h1>
</div>
<div id="content" class="view">
  <div class="page-metadata">Created by Jane</div>
  <div id="main-content" class="wiki-content group"><h1>Intro</h1><p>Hello</p></div>
  <div class="pageSection group">
    <div class="pageSectionHeader"><h2 id="attachments" class="pageSectionTitle">Attachments:</h2></div>
    <div class="greybox" align="left">
      <img src="images/icons/bullet_blue.gif" height="8" width="8" alt=""/>
      <a href="attachments/65541/65545.png">diagram.png</a> (image/png)<br/>
      <img src="images/icons/bullet_blue.gif" height="8" width="8" alt=""/>
      <a href="attachments/65541/65546.pdf">spec.pdf</a> (application/pdf)<br/>
    </div>
  </div>
</div></body></html>`;

describe('parseConfluencePage', () => {
  it('extracts title, body, breadcrumbs and attachments', () => {
    const p = parseConfluencePage(PAGE);
    expect(p.title).toBe('Design Notes');
    expect(p.bodyHtml).toBe('<h1>Intro</h1><p>Hello</p>');
    expect(p.breadcrumbHrefs).toEqual(['Engineering-Home_65538.html', 'Architecture_65540.html']);
    expect(p.attachments).toEqual([
      { href: 'attachments/65541/65545.png', fileName: 'diagram.png', mimeType: 'image/png' },
      { href: 'attachments/65541/65546.pdf', fileName: 'spec.pdf', mimeType: 'application/pdf' },
    ]);
  });
});

describe('formatConfluenceHtml', () => {
  it('converts code blocks with language and title', () => {
    const out = formatConfluenceHtml(`<div class="code panel pdl"><div class="codeHeader panelHeader pdl"><b>Example</b></div><div class="codeContent panelContent pdl"><pre class="syntaxhighlighter-pre" data-syntaxhighlighter-params="brush: js; gutter: false">const a = 1 &lt; 2;</pre></div></div>`);
    expect(out).toBe('<p><strong>Example</strong></p><pre><code class="language-javascript">const a = 1 &lt; 2;</code></pre>');
  });

  it('converts info/note/warning/tip macros to callouts', () => {
    const out = formatConfluenceHtml(
      `<div class="confluence-information-macro confluence-information-macro-warning"><span class="aui-icon confluence-information-macro-icon"></span><div class="confluence-information-macro-body"><p>Careful</p></div></div>` +
        `<div class="confluence-information-macro confluence-information-macro-tip"><p class="title">Pro tip</p><div class="confluence-information-macro-body"><p>Do it</p></div></div>`,
    );
    expect(out).toContain('<div data-type="callout" data-callout-type="danger"><p>Careful</p></div>');
    expect(out).toContain('data-callout-type="success"><p><strong>Pro tip</strong></p><p>Do it</p></div>');
  });

  it('converts expand macros, task lists and status lozenges', () => {
    const out = formatConfluenceHtml(
      `<div class="expand-container"><div class="expand-control"><span class="expand-control-icon"></span><span class="expand-control-text">More</span></div><div class="expand-content"><p>Hidden</p></div></div>` +
        `<ul class="inline-task-list"><li class="checked" data-inline-task-id="1">Done</li><li data-inline-task-id="2">Todo</li></ul>` +
        `<p><span class="status-macro aui-lozenge aui-lozenge-success">DONE</span></p>`,
    );
    expect(out).toContain('<details><summary>More</summary><div data-type="detailsContent"><p>Hidden</p></div></details>');
    expect(out).toContain('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li><li data-type="taskItem" data-checked="false"><p>Todo</p></li></ul>');
    expect(out).toContain('<span data-type="status" data-color="green">DONE</span>');
  });

  it('drops TOC, icons and emoticon images, unwraps layouts', () => {
    const out = formatConfluenceHtml(
      `<div class="toc-macro">x</div><div class="contentLayout2"><div class="columnLayout"><div class="cell"><div class="innerCell"><p>A <img class="emoticon" data-emoji-fallback="🙂" src="images/icons/emoticons/smile.svg"></p></div></div></div></div>` +
        `<span class="confluence-embedded-file-wrapper"><img class="confluence-embedded-image" src="attachments/1/2.png"></span>`,
    );
    expect(out).toBe('<p>A 🙂</p><img class="confluence-embedded-image" src="attachments/1/2.png">');
  });

  it('maps brushes to editor languages', () => {
    expect(normaliseLanguage('C#')).toBe('csharp');
    expect(normaliseLanguage('sql')).toBe('sql');
    expect(normaliseLanguage(undefined)).toBeUndefined();
  });
});

describe('index and links', () => {
  it('reads the page tree from index.html', () => {
    const idx = parseConfluenceIndex(`<div class="pageSection"><h2>Available Pages:</h2><ul>
      <li><a href="Home_1001.html">Home</a><ul>
        <li><a href="Child-A_1002.html">Child A</a><ul><li><a href="Grand_1004.html">Grand</a></li></ul></li>
        <li><a href="Child-B_1003.html">Child B</a></li>
      </ul></li></ul></div>`);
    expect(idx.order).toEqual(['Home_1001.html', 'Child-A_1002.html', 'Grand_1004.html', 'Child-B_1003.html']);
    expect(idx.parents.get('Home_1001.html')).toBeNull();
    expect(idx.parents.get('Grand_1004.html')).toBe('Child-A_1002.html');
    expect(idx.parents.get('Child-B_1003.html')).toBe('Home_1001.html');
  });

  it('finds page ids in file names and URLs', () => {
    expect(confluencePageId('Child-A_1002.html')).toBe('1002');
    expect(confluencePageId('65538.html')).toBe('65538');
    expect(confluencePageId('https://x.atlassian.net/wiki/spaces/ENG/pages/98765/Title')).toBe('98765');
    expect(confluencePageId('/pages/viewpage.action?pageId=4321')).toBe('4321');
  });

  it('rewrites Confluence URLs to export files', () => {
    const out = rewriteConfluenceLinks(
      '<a href="https://x.atlassian.net/wiki/spaces/ENG/pages/1002/Child+A">A</a><a href="https://example.com">x</a>',
      new Map([['1002', 'Child-A_1002.html']]),
    );
    expect(out).toBe('<a href="Child-A_1002.html">A</a><a href="https://example.com">x</a>');
  });

  it('keeps attachments that the body does not reference', () => {
    const out = appendUnreferencedAttachments('<p><img src="attachments/1/2.png"></p>', [
      { href: 'attachments/1/2.png', fileName: 'a.png', mimeType: 'image/png' },
      { href: 'attachments/1/3.pdf', fileName: 'b.pdf', mimeType: 'application/pdf' },
    ]);
    expect(out).toContain(
      '<h2>Attachments</h2><div data-type="attachment" data-attachment-url="attachments/1/3.pdf" data-attachment-name="b.pdf" data-attachment-mime="application/pdf"></div>',
    );
    expect(out).not.toContain('a.png');
  });
});
