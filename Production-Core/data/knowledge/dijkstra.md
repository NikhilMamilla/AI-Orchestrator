---
id: dijkstra
title: Dijkstra's Algorithm
domain: advanced-algorithms
level: advanced
prerequisites: [graph-basics, heap-priority-queue, breadth-first-search]
tags: [dijkstra, shortest path, weighted graph, priority queue, greedy, relaxation]
---
# Dijkstra's Algorithm

## Overview
Dijkstra's algorithm finds the shortest path from a source vertex to all other vertices in a graph with non-negative edge weights. It is a greedy algorithm: it repeatedly finalizes the unvisited vertex with the smallest known distance.

## Algorithm
Set the distance of the source to 0 and all others to infinity. Use a min-heap keyed by distance. Pop the vertex u with the smallest distance; for each edge (u, v, w), relax it: if dist[u] + w < dist[v], update dist[v] and push v.

```python
import heapq

def dijkstra(graph, src):
    dist = {src: 0}
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, float('inf')):
            continue                       # stale entry
        for v, w in graph[u]:
            nd = d + w
            if nd < dist.get(v, float('inf')):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist
```

## Complexity
With a binary heap the time is O((V + E) log V) and space is O(V + E).

## Why non-negative weights
Once a vertex is popped, its distance is final because any other route to it would have to pass through vertices with distance at least as large. A negative edge could later reduce that distance and break the argument. For negative weights use Bellman-Ford, which is O(V * E) and detects negative cycles.

## Pitfalls
Using Dijkstra with negative edges, forgetting to skip stale heap entries, and using BFS when weights differ. For unweighted graphs BFS is simpler and faster.
