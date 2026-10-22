/** Minimal parser for the markdown subset produced by the methodology report. */

export type MarkdownBlock =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

export const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  const pushListItem = (type: 'ul' | 'ol', text: string) => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === type) {
      last.items.push(text);
    } else {
      blocks.push({ type, items: [text] });
    }
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: `h${heading[1].length}` as 'h1' | 'h2' | 'h3', text: heading[2] });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      blocks.push({ type: 'quote', text: quote[1] });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      pushListItem('ul', bullet[1]);
      continue;
    }
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      pushListItem('ol', numbered[1]);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** HTML document that Word opens as a regular document (saved with the .doc extension) */
export const blocksToWordHtml = (title: string, blocks: MarkdownBlock[]): string => {
  const body = blocks
    .map((block) => {
      if ('items' in block) {
        const items = block.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
        return `<${block.type}>${items}</${block.type}>`;
      }
      const tag = block.type === 'quote' ? 'blockquote' : block.type;
      return `<${tag}>${escapeHtml(block.text)}</${tag}>`;
    })
    .join('\n');
  return (
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    '<style>body{font-family:"Times New Roman",serif;font-size:14pt;line-height:1.5}' +
    'h1{font-size:18pt}h2{font-size:16pt}h3{font-size:14pt}' +
    'p{text-align:justify;margin:0 0 6pt}</style></head>' +
    `<body>${body}</body></html>`
  );
};
