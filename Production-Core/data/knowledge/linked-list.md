---
id: linked-list
title: Linked List
domain: data-structures
level: beginner
prerequisites: [arrays]
tags: [linked list, node, pointer, singly, doubly, cycle detection]
---
# Linked List

## Overview
A linked list is a chain of nodes. Each node stores a value and a reference (pointer) to the next node. Unlike an array, nodes need not be contiguous in memory, so there is no O(1) indexing, but insertion and deletion at a known node are cheap.

## Types
A singly linked list has one next pointer per node. A doubly linked list also stores a previous pointer, allowing backward traversal and O(1) deletion given a node. A circular linked list links the last node back to the first.

## Operations and cost
- Access the k-th element: O(k), since you must walk from the head.
- Insert or delete at the head: O(1).
- Insert or delete after a known node: O(1).
- Search: O(n).

## Example: reverse a list
```python
def reverse(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev, head = head, nxt
    return prev
```
This runs in O(n) time and O(1) extra space by re-pointing each node.

## Cycle detection
Floyd's tortoise and hare uses two pointers: slow moves one step and fast moves two. If there is a cycle they eventually meet; if fast reaches null there is no cycle. It uses O(1) space. The middle node is found the same way: when fast reaches the end, slow is at the middle.

## Pitfalls
Losing the reference to the rest of the list during pointer updates, forgetting to handle the empty list and single-node cases, and null pointer dereferences. A dummy head node simplifies edge cases.
