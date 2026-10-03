---
id: heap-priority-queue
title: Heap and Priority Queue
domain: data-structures
level: intermediate
prerequisites: [binary-tree, arrays]
tags: [heap, priority queue, min heap, max heap, heapify, top k]
---
# Heap and Priority Queue

## Overview
A heap is a complete binary tree stored in an array that satisfies the heap property. In a min-heap every parent is less than or equal to its children, so the smallest element is at the root; a max-heap is the opposite. A priority queue is the abstract data type that always serves the highest-priority element, and a heap is the standard implementation.

## Array layout
For a node at index i (0-based), the parent is (i - 1) // 2, the left child is 2i + 1 and the right child is 2i + 2. No pointers are needed.

## Operations and cost
- Peek the min or max: O(1).
- Insert: add at the end and sift up, O(log n).
- Extract the min or max: swap the root with the last element, remove it, and sift down, O(log n).
- Build a heap from n elements with heapify: O(n), not O(n log n).

```python
import heapq
h = []
for x in [5, 1, 8, 3]:
    heapq.heappush(h, x)
print(heapq.heappop(h))   # 1
```
Python's heapq is a min-heap; push negated values to simulate a max-heap.

## Applications
Top-k elements using a size-k min-heap in O(n log k), merging k sorted lists, Dijkstra's algorithm, heap sort (O(n log n), in-place, not stable) and running median with two heaps.

## Pitfalls
A heap is not fully sorted; only the root is guaranteed to be the extreme. Searching for an arbitrary element is O(n).
