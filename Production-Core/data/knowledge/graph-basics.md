---
id: graph-basics
title: Graph Basics
domain: data-structures
level: intermediate
prerequisites: [arrays, hash-table, linked-list]
tags: [graph, vertex, edge, adjacency list, adjacency matrix, directed, weighted]
---
# Graph Basics

## Overview
A graph is a set of vertices (nodes) connected by edges. Edges can be directed or undirected and weighted or unweighted. Graphs model networks such as roads, social connections and dependencies. A tree is a connected graph with no cycles.

## Representations
An adjacency list stores, for each vertex, a list of its neighbours. It uses O(V + E) space and is best for sparse graphs. An adjacency matrix is a V x V table where cell (i, j) records an edge; it uses O(V^2) space, tests whether an edge exists in O(1), and suits dense graphs.

```python
from collections import defaultdict
g = defaultdict(list)
for u, v in [(0, 1), (0, 2), (1, 3)]:
    g[u].append(v)
    g[v].append(u)      # omit for a directed graph
```

## Terminology
A path is a sequence of connected vertices. A cycle returns to its start. A graph is connected if every vertex is reachable from every other. A directed acyclic graph (DAG) has directed edges and no cycles. The degree of a vertex is its number of edges.

## Traversal
Breadth-first search and depth-first search both visit every vertex and edge in O(V + E). Graphs may contain cycles, so keep a visited set to avoid infinite loops.

## Pitfalls
Forgetting a visited set, treating a directed graph as undirected, and handling disconnected graphs by starting traversal from only one vertex.
