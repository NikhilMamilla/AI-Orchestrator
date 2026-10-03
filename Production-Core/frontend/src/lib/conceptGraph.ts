// Generated from data/knowledge/*.md front matter by a script; the landing-page 3D scene draws the real curriculum graph.
export interface GraphNode { id: string; title: string; level: string; prereqs: string[] }

export const CONCEPT_GRAPH: GraphNode[] = [
  {
    "id": "arrays",
    "title": "Arrays",
    "level": "beginner",
    "prereqs": [
      "big-o-complexity"
    ]
  },
  {
    "id": "backtracking",
    "title": "Backtracking",
    "level": "advanced",
    "prereqs": [
      "recursion",
      "depth-first-search"
    ]
  },
  {
    "id": "big-o-complexity",
    "title": "Time and Space Complexity (Big-O)",
    "level": "beginner",
    "prereqs": []
  },
  {
    "id": "binary-search-tree",
    "title": "Binary Search Tree",
    "level": "intermediate",
    "prereqs": [
      "binary-tree",
      "binary-search",
      "recursion"
    ]
  },
  {
    "id": "binary-search",
    "title": "Binary Search",
    "level": "beginner",
    "prereqs": [
      "arrays",
      "big-o-complexity"
    ]
  },
  {
    "id": "binary-tree",
    "title": "Binary Tree",
    "level": "intermediate",
    "prereqs": [
      "recursion",
      "linked-list"
    ]
  },
  {
    "id": "bit-manipulation",
    "title": "Bit Manipulation",
    "level": "intermediate",
    "prereqs": [
      "big-o-complexity"
    ]
  },
  {
    "id": "breadth-first-search",
    "title": "Breadth-First Search (BFS)",
    "level": "intermediate",
    "prereqs": [
      "graph-basics",
      "queue"
    ]
  },
  {
    "id": "depth-first-search",
    "title": "Depth-First Search (DFS)",
    "level": "intermediate",
    "prereqs": [
      "graph-basics",
      "recursion",
      "stack"
    ]
  },
  {
    "id": "dijkstra",
    "title": "Dijkstra's Algorithm",
    "level": "advanced",
    "prereqs": [
      "graph-basics",
      "heap-priority-queue",
      "breadth-first-search"
    ]
  },
  {
    "id": "dynamic-programming",
    "title": "Dynamic Programming",
    "level": "advanced",
    "prereqs": [
      "recursion",
      "big-o-complexity",
      "arrays"
    ]
  },
  {
    "id": "graph-basics",
    "title": "Graph Basics",
    "level": "intermediate",
    "prereqs": [
      "arrays",
      "hash-table",
      "linked-list"
    ]
  },
  {
    "id": "greedy-algorithms",
    "title": "Greedy Algorithms",
    "level": "intermediate",
    "prereqs": [
      "sorting-algorithms",
      "big-o-complexity"
    ]
  },
  {
    "id": "hash-table",
    "title": "Hash Table",
    "level": "beginner",
    "prereqs": [
      "arrays",
      "big-o-complexity"
    ]
  },
  {
    "id": "heap-priority-queue",
    "title": "Heap and Priority Queue",
    "level": "intermediate",
    "prereqs": [
      "binary-tree",
      "arrays"
    ]
  },
  {
    "id": "linked-list",
    "title": "Linked List",
    "level": "beginner",
    "prereqs": [
      "arrays"
    ]
  },
  {
    "id": "prefix-sum",
    "title": "Prefix Sum",
    "level": "intermediate",
    "prereqs": [
      "arrays"
    ]
  },
  {
    "id": "queue",
    "title": "Queue and Deque",
    "level": "beginner",
    "prereqs": [
      "arrays",
      "linked-list"
    ]
  },
  {
    "id": "recursion",
    "title": "Recursion",
    "level": "beginner",
    "prereqs": [
      "big-o-complexity"
    ]
  },
  {
    "id": "sorting-algorithms",
    "title": "Sorting Algorithms",
    "level": "intermediate",
    "prereqs": [
      "arrays",
      "recursion",
      "big-o-complexity"
    ]
  },
  {
    "id": "stack",
    "title": "Stack",
    "level": "beginner",
    "prereqs": [
      "arrays",
      "linked-list"
    ]
  },
  {
    "id": "string-matching-kmp",
    "title": "String Matching (KMP and Rabin-Karp)",
    "level": "advanced",
    "prereqs": [
      "arrays",
      "hash-table"
    ]
  },
  {
    "id": "topological-sort",
    "title": "Topological Sort",
    "level": "advanced",
    "prereqs": [
      "depth-first-search",
      "breadth-first-search",
      "graph-basics"
    ]
  },
  {
    "id": "trie",
    "title": "Trie (Prefix Tree)",
    "level": "advanced",
    "prereqs": [
      "binary-tree",
      "hash-table"
    ]
  },
  {
    "id": "two-pointers-sliding-window",
    "title": "Two Pointers and Sliding Window",
    "level": "intermediate",
    "prereqs": [
      "arrays"
    ]
  },
  {
    "id": "union-find",
    "title": "Union-Find (Disjoint Set Union)",
    "level": "advanced",
    "prereqs": [
      "arrays",
      "graph-basics"
    ]
  }
];
