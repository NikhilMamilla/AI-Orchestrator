---
id: topological-sort
title: Topological Sort
domain: advanced-algorithms
level: advanced
prerequisites: [depth-first-search, breadth-first-search, graph-basics]
tags: [topological sort, dag, dependencies, kahn, in-degree, scheduling]
---
# Topological Sort

## Overview
A topological ordering of a directed acyclic graph (DAG) lists the vertices so that for every edge u -> v, u appears before v. It is used for task scheduling, build systems, and course prerequisites. A topological order exists if and only if the graph has no cycle.

## Kahn's algorithm (BFS)
Compute the in-degree of every vertex. Put all vertices with in-degree 0 in a queue. Repeatedly remove a vertex, append it to the order, and decrement the in-degree of its neighbours, enqueueing any that reach 0. If the order contains fewer than V vertices, the graph has a cycle.

```python
from collections import deque

def topo_sort(n, edges):
    adj, indeg = [[] for _ in range(n)], [0] * n
    for u, v in edges:
        adj[u].append(v)
        indeg[v] += 1
    q = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    return order if len(order) == n else []     # [] means a cycle
```

## DFS approach
Run DFS and append each vertex to a list after all its descendants are processed (post-order). The reverse of that list is a valid topological order.

## Complexity
Both approaches run in O(V + E) time and O(V) space.

## Pitfalls
Topological order is generally not unique. Running it on a graph with a cycle silently produces a partial order unless you check the count.
