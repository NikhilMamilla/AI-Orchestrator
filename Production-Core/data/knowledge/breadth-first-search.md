---
id: breadth-first-search
title: Breadth-First Search (BFS)
domain: algorithms
level: intermediate
prerequisites: [graph-basics, queue]
tags: [bfs, breadth first search, shortest path, level order, queue, unweighted]
---
# Breadth-First Search (BFS)

## Overview
BFS explores a graph level by level: first the start vertex, then all its neighbours, then their neighbours, and so on. It uses a queue to process vertices in the order they were discovered.

## Algorithm
Push the start vertex into a queue and mark it visited. While the queue is not empty, dequeue a vertex and enqueue each unvisited neighbour, marking it visited at the moment it is enqueued.

```python
from collections import deque

def bfs(graph, start):
    dist = {start: 0}
    q = deque([start])
    while q:
        u = q.popleft()
        for v in graph[u]:
            if v not in dist:
                dist[v] = dist[u] + 1
                q.append(v)
    return dist
```

## Complexity
Time is O(V + E) with an adjacency list. Space is O(V) for the queue and visited set.

## Shortest paths
In an unweighted graph BFS finds the shortest path (fewest edges) from the source to every reachable vertex, because vertices are discovered in increasing distance order. It does not work for weighted edges; use Dijkstra's algorithm instead. Multi-source BFS starts with several sources in the queue and solves problems such as rotting oranges or nearest gate.

## Pitfalls
Marking visited when dequeuing instead of when enqueuing lets the same vertex enter the queue many times. Using BFS for weighted shortest paths is incorrect. On grids, forgetting boundary checks.
