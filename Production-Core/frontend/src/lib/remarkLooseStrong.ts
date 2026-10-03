/**
 * A remark plugin that turns any `**text**` the parser left as plain text into bold.
 *
 * CommonMark only treats `**` as emphasis when it is "flanking" (e.g. `**Example:**Use` or `x**y**` are not), so model
 * answers sometimes show literal asterisks. After parsing, any text node that still contains `**...**` (on one line)
 * is split into text and `strong` nodes. Code (inline or block) is never touched: it is not a text node.
 */
type Node = { type: string; value?: string; children?: Node[] };

const PAIR = /\*\*([^*\n]+?)\*\*/g;

function split(value: string): Node[] | null {
    PAIR.lastIndex = 0;
    if (!PAIR.test(value)) return null;
    PAIR.lastIndex = 0;
    const out: Node[] = [];
    let last = 0;
    for (const m of value.matchAll(PAIR)) {
        const at = m.index ?? 0;
        if (at > last) out.push({ type: 'text', value: value.slice(last, at) });
        out.push({ type: 'strong', children: [{ type: 'text', value: m[1] }] });
        last = at + m[0].length;
    }
    if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
    return out;
}

function walk(node: Node): void {
    if (!node.children) return;
    const next: Node[] = [];
    for (const child of node.children) {
        if (child.type === 'text' && child.value) {
            const parts = split(child.value);
            if (parts) { next.push(...parts); continue; }
        }
        walk(child);
        next.push(child);
    }
    node.children = next;
}

export default function remarkLooseStrong() {
    return (tree: Node) => walk(tree);
}
