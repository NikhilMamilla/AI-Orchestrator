---
id: union-find
title: Union-Find (Disjoint Set Union)
domain: data-structures
level: advanced
prerequisites: [arrays, graph-basics]
tags: [union find, disjoint set, dsu, path compression, union by rank, kruskal, connected components]
---
# Union-Find (Disjoint Set Union)

## Overview
Union-Find maintains a collection of disjoint sets and supports two operations: find(x) returns the representative (root) of x's set, and union(x, y) merges the sets containing x and y. It answers "are these two nodes connected?" quickly.

## Implementation
Each element points to a parent; a root points to itself. Two optimizations make it almost constant time: path compression flattens the tree during find, and union by rank or size attaches the smaller tree under the larger.

```python
class DSU:
    def __init__(self, n):
        self.p = list(range(n))
        self.size = [1] * n

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]     # path compression (halving)
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.p[rb] = ra
        self.size[ra] += self.size[rb]
        return True
```

## Complexity
With both optimizations each operation takes O(alpha(n)) amortized, where alpha is the inverse Ackermann function, effectively a constant below 5 for any practical n. Without them, find can degrade to O(n).

## Applications
Kruskal's minimum spanning tree algorithm, counting connected components, detecting a cycle in an undirected graph (a union that returns false means the edge closes a cycle), and grouping equivalent items.

## Pitfalls
Calling union on elements instead of their roots, and forgetting that union-find supports merging but not splitting sets.
