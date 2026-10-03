---
id: queue
title: Queue and Deque
domain: data-structures
level: beginner
prerequisites: [arrays, linked-list]
tags: [queue, fifo, enqueue, dequeue, deque, circular buffer]
---
# Queue and Deque

## Overview
A queue is a first-in, first-out (FIFO) collection. Elements are added at the back (enqueue) and removed from the front (dequeue), like people waiting in line. A deque (double-ended queue) allows insertion and removal at both ends.

## Operations and cost
enqueue, dequeue and peek are O(1) when implemented with a linked list or a circular buffer. A naive array implementation that removes from index 0 costs O(n) per dequeue because every element shifts.

## Circular buffer
A circular (ring) buffer keeps head and tail indices and wraps them with modulo arithmetic, giving O(1) enqueue and dequeue in fixed memory.

## Example
```python
from collections import deque
q = deque()
q.append(1)        # enqueue
q.append(2)
front = q.popleft()  # dequeue, O(1)
```
Use collections.deque in Python, not a list, because list.pop(0) is O(n).

## Where queues are used
Breadth-first search, task scheduling, print spooling, buffering streaming data and level-order tree traversal. A sliding-window maximum uses a monotonic deque to achieve O(n).

## Pitfalls
Confusing queue order with stack order, dequeuing from an empty queue, and in a circular buffer failing to distinguish full from empty.
