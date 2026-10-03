/** One colour per syllabus group; the landing page uses the same table so hovering a card lights the same nodes. */
export const GROUPS: { id: string; color: string; ids: string[] }[] = [
    { id: 'Foundations', color: '#f5b84b', ids: ['big-o-complexity', 'recursion', 'bit-manipulation', 'prefix-sum'] },
    { id: 'Arrays & Strings', color: '#ff7a6b', ids: ['arrays', 'two-pointers-sliding-window', 'string-matching-kmp', 'sorting-algorithms'] },
    { id: 'Linear Structures', color: '#4ad6a7', ids: ['linked-list', 'stack', 'queue', 'hash-table'] },
    { id: 'Trees', color: '#8f7bff', ids: ['binary-tree', 'binary-search-tree', 'heap-priority-queue', 'trie'] },
    { id: 'Graphs', color: '#4cc3ff', ids: ['graph-basics', 'breadth-first-search', 'depth-first-search', 'topological-sort', 'dijkstra', 'union-find'] },
    { id: 'Paradigms', color: '#ff7bd0', ids: ['binary-search', 'dynamic-programming', 'greedy-algorithms', 'backtracking'] },
];
