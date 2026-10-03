---
id: depth-first-search
title: Depth-First Search (DFS)
domain: algorithms
level: intermediate
prerequisites: [graph-basics, recursion, stack]
tags: [dfs, depth first search, backtracking, connected components, cycle detection]
---
# Depth-First Search (DFS)

## Overview
DFS explores as far as possible along one branch before backtracking. It can be written recursively, using the call stack, or iteratively with an explicit stack.

## Recursive implementation
```python
def dfs(graph, u, visited):
    visited.add(u)
    for v in graph[u]:
        if v not in visited:
            dfs(graph, v, visited)
```

## Complexity
Time is O(V + E) with an adjacency list. Space is O(V) for the visited set plus O(depth) for the recursion stack, which can reach O(V) on a long path.

## Applications
Finding connected components, detecting cycles, topological sorting, solving mazes and flood fill, and exploring all possibilities in backtracking. In a directed graph a cycle exists if DFS reaches a vertex that is currently on the recursion stack (a back edge). In an undirected graph a cycle exists if DFS reaches a visited vertex that is not the parent.

## DFS versus BFS
DFS uses less memory on wide graphs and is natural for exhaustive search and recursion. BFS finds shortest paths in unweighted graphs. DFS does not guarantee shortest paths.

## Pitfalls
Deep recursion can overflow the stack on large graphs, so convert to an iterative version. Forgetting the visited set loops forever on cycles. Mixing up the on-stack check for directed cycle detection with the simple visited check.
