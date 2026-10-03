import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkLooseStrong from './remarkLooseStrong';

const html = (md: string) => renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm, remarkLooseStrong]}>{md}</ReactMarkdown>);

describe('remarkLooseStrong', () => {
    it('bolds pairs CommonMark leaves as literal asterisks', () => {
        expect(html('**Example:**Use a stack')).toContain('<strong>Example:</strong>Use a stack');
        expect(html('O(n)**worst case**')).toContain('<strong>worst case</strong>');
    });
    it('keeps normal bold and never touches code', () => {
        expect(html('**Key steps:**')).toContain('<strong>Key steps:</strong>');
        expect(html('`a**b**c`')).toContain('<code>a**b**c</code>');
        expect(html('```\nx = **y**\n```')).toContain('x = **y**');
    });
});
