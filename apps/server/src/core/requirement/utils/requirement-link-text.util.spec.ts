import { findKeyOccurrences, linkKeyInPmJson } from './requirement-link-text.util';

describe('findKeyOccurrences', () => {
  it('matches whole keys only', () => {
    expect(findKeyOccurrences('REQ-5 and REQ-56 and XREQ-5', 'REQ-5')).toEqual([
      0,
    ]);
    expect(findKeyOccurrences('(REQ-5), REQ-5.', 'REQ-5')).toEqual([1, 9]);
  });
});

describe('linkKeyInPmJson', () => {
  const para = (...content: any[]) => ({ type: 'paragraph', content });
  let n = 0;
  const id = () => `id${n++}`;

  it('replaces occurrences with refs and keeps surrounding text', () => {
    const doc = {
      type: 'doc',
      content: [para({ type: 'text', text: 'See REQ-5 and REQ-5 again' })],
    };
    const { doc: out, count } = linkKeyInPmJson(doc, 'REQ-5', null, id);
    expect(count).toBe(2);
    expect(out.content[0].content.map((c: any) => c.text ?? c.attrs.key)).toEqual(
      ['See ', 'REQ-5', ' and ', 'REQ-5', ' again'],
    );
  });

  it('leaves code, links and existing refs alone', () => {
    const doc = {
      type: 'doc',
      content: [
        para({ type: 'text', text: 'REQ-5', marks: [{ type: 'code' }] }),
        para({ type: 'text', text: 'REQ-5', marks: [{ type: 'link' }] }),
        { type: 'codeBlock', content: [{ type: 'text', text: 'REQ-5' }] },
        para({ type: 'requirementRef', attrs: { key: 'REQ-5' } }),
      ],
    };
    expect(linkKeyInPmJson(doc, 'REQ-5', null, id).count).toBe(0);
  });
});
