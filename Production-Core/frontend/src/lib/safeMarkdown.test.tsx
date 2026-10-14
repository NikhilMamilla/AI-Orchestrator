import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeMarkdownComponents } from './safeMarkdown';

const html = (md: string) => renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>{md}</ReactMarkdown>);

describe('safeMarkdownComponents', () => {
    it('never renders a model-supplied link: the words stay, the link goes', () => {
        const out = html('See [the docs](https://evil.example/x) now');
        expect(out).toContain('the docs');
        expect(out).not.toContain('<a');
        expect(out).not.toContain('evil.example');
    });
    it('never renders a model-supplied image (it would be a tracking beacon)', () => {
        const out = html('![pixel](https://evil.example/p.png?u=1)');
        expect(out).not.toContain('<img');
        expect(out).not.toContain('evil.example');
    });
    it('keeps ordinary formatting', () => {
        expect(html('**bold** and `code`')).toContain('<strong>bold</strong>');
    });
});
