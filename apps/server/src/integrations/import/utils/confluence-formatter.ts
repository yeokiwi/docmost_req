import { Cheerio, CheerioAPI, load } from 'cheerio';

/**
 * Converts the HTML of one page from a Confluence "Export space → HTML"
 * archive (Cloud, Server and Data Center) into HTML the Docmost editor
 * understands. Only the page body is kept; Confluence chrome (breadcrumbs,
 * metadata, comments, attachment list) is dropped.
 */

export type ConfluenceAttachment = {
  href: string;
  fileName: string;
  mimeType: string;
};

export type ConfluencePageParts = {
  title: string;
  bodyHtml: string;
  attachments: ConfluenceAttachment[];
  breadcrumbHrefs: string[];
};

const CALLOUT_BY_MACRO: Record<string, string> = {
  information: 'info',
  info: 'info',
  note: 'warning',
  warning: 'danger',
  tip: 'success',
  success: 'success',
  error: 'danger',
};

const STATUS_COLORS: Record<string, string> = {
  success: 'green',
  complete: 'green',
  error: 'red',
  removed: 'red',
  current: 'blue',
  'inprogress': 'blue',
  moved: 'yellow',
  new: 'purple',
  default: 'gray',
};

export function parseConfluencePage(html: string, spaceName?: string): ConfluencePageParts {
  const $ = load(html);

  // title: "Space : Page" in the export header; fall back to <title>
  let title =
    $('#title-text').first().text().trim() ||
    $('h1#title-heading').first().text().trim() ||
    $('title').first().text().trim();
  // the first breadcrumb is the space itself
  const crumbSpace = $('#breadcrumbs li').first().text().replace(/\s+/g, ' ').trim();
  title = stripSpacePrefix(title, spaceName || crumbSpace || undefined);

  const breadcrumbHrefs = $('#breadcrumbs a[href]')
    .toArray()
    .map((a) => $(a).attr('href') as string)
    .filter((h) => h && !/^index\.html?$/i.test(h));

  const attachments: ConfluenceAttachment[] = [];
  $('h2#attachments')
    .closest('.pageSection')
    .find('a[href]')
    .each((_, a) => {
      const $a = $(a);
      const href = $a.attr('href') as string;
      if (!href || !href.includes('attachments/')) return;
      const after = ($a[0].nextSibling as any)?.data ?? '';
      const mime = /\(([^)]+)\)/.exec(after)?.[1] ?? '';
      attachments.push({ href, fileName: $a.text().trim(), mimeType: mime.trim() });
    });

  let $body = $('#main-content');
  if (!$body.length) $body = $('.wiki-content').first();
  if (!$body.length) $body = $('body');

  return {
    title,
    bodyHtml: $body.html() ?? '',
    attachments,
    breadcrumbHrefs,
  };
}

export function stripSpacePrefix(title: string, spaceName?: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (spaceName && t.startsWith(`${spaceName} : `)) {
    return t.slice(spaceName.length + 3).trim();
  }
  // "Space : Page" — Confluence uses " : " between space and page name
  const idx = t.indexOf(' : ');
  return idx > 0 ? t.slice(idx + 3).trim() : t;
}

/** Rewrites Confluence macros and markup in a page body. */
export function formatConfluenceHtml(bodyHtml: string): string {
  const $ = load(`<div id="__root">${bodyHtml}</div>`);
  const $root = $('#__root');

  removeNoise($, $root);
  convertCodeBlocks($, $root);
  convertInfoMacros($, $root);
  convertPanels($, $root);
  convertExpands($, $root);
  convertTasks($, $root);
  convertStatus($, $root);
  convertEmoticons($, $root);
  convertUserMentions($, $root);
  unwrapLayouts($, $root);
  cleanImages($, $root);

  return $root.html() ?? '';
}

function removeNoise($: CheerioAPI, $root: Cheerio<any>) {
  $root
    .find(
      [
        '.toc-macro',
        '.client-side-toc-macro',
        'script',
        'style',
        '.confluence-information-macro-icon',
        '.expand-control-icon',
        '.plugin_pagetree',
        '.recently-updated',
        '.aui-message .icon',
      ].join(','),
    )
    .remove();
}

function convertCodeBlocks($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('div.code.panel, div.preformatted.panel, div.codeContent').each((_, el) => {
    const $panel = $(el);
    if (!$panel.parent().length) return;
    const $pre = $panel.find('pre').first();
    if (!$pre.length) return;
    const params = $pre.attr('data-syntaxhighlighter-params') ?? '';
    const brush = /brush:\s*([\w+#-]+)/.exec(params)?.[1];
    const language = normaliseLanguage(brush);
    const titleText = $panel.find('.codeHeader, .panelHeader').first().text().trim();
    const code = $pre.text();
    const $code = $('<code></code>').text(code);
    if (language) $code.attr('class', `language-${language}`);
    const $new = $('<pre></pre>').append($code);
    const target = $panel.closest('div.code.panel, div.preformatted.panel');
    const $replace = target.length ? target : $panel;
    if (titleText) $replace.before($('<p></p>').append($('<strong></strong>').text(titleText)));
    $replace.replaceWith($new);
  });

  // bare syntaxhighlighter <pre> outside a panel
  $root.find('pre.syntaxhighlighter-pre').each((_, el) => {
    const $pre = $(el);
    if ($pre.children('code').length) return;
    const brush = /brush:\s*([\w+#-]+)/.exec($pre.attr('data-syntaxhighlighter-params') ?? '')?.[1];
    const $code = $('<code></code>').text($pre.text());
    const language = normaliseLanguage(brush);
    if (language) $code.attr('class', `language-${language}`);
    $pre.replaceWith($('<pre></pre>').append($code));
  });
}

export function normaliseLanguage(brush?: string): string | undefined {
  if (!brush) return undefined;
  const b = brush.toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript',
    jscript: 'javascript',
    ts: 'typescript',
    py: 'python',
    shell: 'bash',
    sh: 'bash',
    'c#': 'csharp',
    cs: 'csharp',
    cpp: 'cpp',
    'c++': 'cpp',
    xml: 'xml',
    html: 'xml',
    yml: 'yaml',
    ps: 'powershell',
    text: 'plaintext',
    none: 'plaintext',
  };
  return map[b] ?? b;
}

function callout($: CheerioAPI, type: string, $content: Cheerio<any>, title?: string) {
  const $c = $('<div></div>').attr('data-type', 'callout').attr('data-callout-type', type);
  if (title) $c.append($('<p></p>').append($('<strong></strong>').text(title)));
  const inner = $content.html()?.trim();
  $c.append(inner ? inner : '<p></p>');
  return $c;
}

function convertInfoMacros($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('.confluence-information-macro').each((_, el) => {
    const $m = $(el);
    const cls = $m.attr('class') ?? '';
    const kind = /confluence-information-macro-(information|note|warning|tip)/.exec(cls)?.[1] ?? 'information';
    const title = $m.find('> .title, > p.title').first().text().trim() || undefined;
    $m.find('> .title, > p.title').remove();
    const $body = $m.find('.confluence-information-macro-body').first();
    $m.replaceWith(callout($, CALLOUT_BY_MACRO[kind], $body.length ? $body : $m, title));
  });

  // newer Cloud exports: <div class="panel" data-panel-type="info">
  $root.find('[data-panel-type]').each((_, el) => {
    const $m = $(el);
    const kind = ($m.attr('data-panel-type') ?? 'info').toLowerCase();
    const $body = $m.find('.panelContent, [data-panel-content]').first();
    $m.replaceWith(callout($, CALLOUT_BY_MACRO[kind] ?? 'default', $body.length ? $body : $m));
  });
}

function convertPanels($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('div.panel').each((_, el) => {
    const $p = $(el);
    if (!$p.parent().length) return;
    const title = $p.find('> .panelHeader').first().text().trim() || undefined;
    const $body = $p.find('> .panelContent').first();
    $p.replaceWith(callout($, 'default', $body.length ? $body : $p, title));
  });
}

function convertExpands($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('.expand-container').each((_, el) => {
    const $e = $(el);
    const summary = $e.find('.expand-control-text').first().text().trim() || 'Details';
    const inner = $e.find('.expand-content').first().html()?.trim() || '<p></p>';
    const $d = $('<details></details>')
      .append($('<summary></summary>').text(summary))
      .append($('<div data-type="detailsContent"></div>').append(inner));
    $e.replaceWith($d);
  });
}

function convertTasks($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('ul.inline-task-list').each((_, el) => {
    const $ul = $(el);
    $ul.attr('data-type', 'taskList').removeAttr('class');
    $ul.children('li').each((__, li) => {
      const $li = $(li);
      const checked = ($li.attr('class') ?? '').includes('checked');
      const inner = $li.html() ?? '';
      $li
        .attr('data-type', 'taskItem')
        .attr('data-checked', checked ? 'true' : 'false')
        .removeAttr('class')
        .removeAttr('data-inline-task-id')
        .html(/^\s*<p[\s>]/i.test(inner) ? inner : `<p>${inner}</p>`);
    });
  });
}

function convertStatus($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('span.status-macro').each((_, el) => {
    const $s = $(el);
    const cls = $s.attr('class') ?? '';
    const variant = /aui-lozenge-(\w+)/.exec(cls)?.[1] ?? 'default';
    const color = STATUS_COLORS[variant] ?? 'gray';
    $s.replaceWith(
      $('<span></span>').attr('data-type', 'status').attr('data-color', color).text($s.text().trim()),
    );
  });
}

function convertEmoticons($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('img.emoticon').each((_, el) => {
    const $i = $(el);
    const fallback = $i.attr('data-emoji-fallback') || $i.attr('alt') || '';
    $i.replaceWith(/^[:(]/.test(fallback) ? '' : fallback);
  });
}

function convertUserMentions($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('a.confluence-userlink, a.user-mention, span.user-mention').each((_, el) => {
    const $a = $(el);
    $a.replaceWith($('<span></span>').text($a.text().trim()));
  });
}

function unwrapLayouts($: CheerioAPI, $root: Cheerio<any>) {
  // page layouts and section macros become plain flowing content
  for (const sel of ['.contentLayout2', '.columnLayout', '.cell', '.innerCell', '.sectionColumnWrapper', '.sectionMacro', '.columnMacro', '.table-wrap', '.confluence-embedded-file-wrapper']) {
    $root.find(sel).each((_, el) => {
      const $el = $(el);
      $el.replaceWith($el.contents());
    });
  }
}

function cleanImages($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('img').each((_, el) => {
    const $img = $(el);
    // Confluence keeps the original in data-image-src; src may be a thumbnail
    const original = $img.attr('data-image-src');
    const src = $img.attr('src') ?? '';
    if (original && !/^https?:/i.test(original) && /thumbnails\//.test(src)) {
      $img.attr('src', original);
    }
    if ((src || original || '').includes('images/icons/')) {
      $img.remove();
    }
  });
}

/**
 * Reads the page tree from the export's index.html ("Available Pages"
 * nested lists). Returns href → parent href (null for top level) and the
 * order in which pages appear.
 */
export function parseConfluenceIndex(indexHtml: string): {
  spaceName?: string;
  parents: Map<string, string | null>;
  order: string[];
  homeHref?: string;
} {
  const $ = load(indexHtml);
  const parents = new Map<string, string | null>();
  const order: string[] = [];

  const walk = ($ul: Cheerio<any>, parent: string | null) => {
    $ul.children('li').each((_, li) => {
      const $li = $(li);
      const href = $li.children('a[href]').first().attr('href');
      let next = parent;
      if (href && /\.html?$/i.test(href) && !parents.has(href)) {
        parents.set(href, parent);
        order.push(href);
        next = href;
      }
      $li.children('ul').each((__, ul) => walk($(ul), next));
    });
  };

  const $section = $('h2')
    .filter((_, h) => /available pages/i.test($(h).text()))
    .first()
    .closest('.pageSection');
  const $lists = $section.length ? $section.find('> ul, .pageSection > ul') : $('#main-content > ul');
  $lists.each((_, ul) => walk($(ul), null));
  if (order.length === 0) {
    $('ul').first().each((_, ul) => walk($(ul), null));
  }

  const spaceName =
    stripTrailing($('#title-text').first().text().trim()) ||
    $('table.confluenceTable td').eq(1).text().trim() ||
    undefined;

  return { spaceName, parents, order, homeHref: order[0] };
}

function stripTrailing(s: string) {
  return s.replace(/\s*:\s*$/, '').replace(/\s+Home$/, '').trim();
}

/** Confluence page id from an export file name or a Confluence URL. */
export function confluencePageId(ref: string): string | undefined {
  const m =
    /pageId=(\d+)/.exec(ref) ||
    /\/pages\/(\d+)(?:\/|$|\?|#)/.exec(ref) ||
    /(?:^|[_/])(\d{3,})\.html?(?:$|[?#])/.exec(ref);
  return m?.[1];
}

/** Points Confluence URLs (…/pages/123/…, viewpage.action?pageId=123) at export files. */
export function rewriteConfluenceLinks(html: string, hrefById: Map<string, string>): string {
  const $ = load(html, null, false);
  $('a[href]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href')!;
    if (!/pageId=|\/pages\/\d+/.test(href)) return;
    const id = confluencePageId(href);
    const target = id ? hrefById.get(id) : undefined;
    if (target) $a.attr('href', target);
  });
  return $.html();
}

/** Files only listed in the page's attachment section are kept as attachments. */
export function appendUnreferencedAttachments(
  html: string,
  attachments: ConfluenceAttachment[],
): string {
  if (attachments.length === 0) return html;
  const decoded = decodeURIComponent(html.replace(/%(?![0-9a-f]{2})/gi, '%25'));
  const missing = attachments.filter((a) => {
    const plain = a.href.split('?')[0];
    return !html.includes(plain) && !decoded.includes(decodeSafe(plain));
  });
  if (missing.length === 0) return html;
  const items = missing
    .map(
      (a) =>
        `<div data-type="attachment" data-attachment-url="${escapeAttr(a.href)}" data-attachment-name="${escapeAttr(a.fileName || a.href)}"${a.mimeType ? ` data-attachment-mime="${escapeAttr(a.mimeType)}"` : ''}></div>`,
    )
    .join('');
  return `${html}<h2>Attachments</h2>${items}`;
}

function decodeSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
