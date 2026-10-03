---
id: two-pointers-sliding-window
title: Two Pointers and Sliding Window
domain: algorithms
level: intermediate
prerequisites: [arrays]
tags: [two pointers, sliding window, subarray, substring, technique]
---
# Two Pointers and Sliding Window

## Two pointers
Two pointers uses two indices that move through an array to avoid a nested loop. On a sorted array, put one pointer at each end: if the sum is too small move the left pointer right, if too large move the right pointer left. This finds a pair with a target sum in O(n) instead of O(n^2). A fast and slow pointer pair detects cycles and removes duplicates in place.

```python
def pair_sum_sorted(a, target):
    l, r = 0, len(a) - 1
    while l < r:
        s = a[l] + a[r]
        if s == target:
            return (l, r)
        l, r = (l + 1, r) if s < target else (l, r - 1)
```

## Sliding window
A sliding window maintains a contiguous range [left, right] and updates its state incrementally as the window moves, rather than recomputing from scratch. A fixed-size window of size k slides one step at a time, adding the new element and removing the old one, giving O(n) for maximum sum of k elements.

A variable-size window expands right to include elements and shrinks left while a constraint is violated. The longest substring without repeating characters is solved this way using a set or a dictionary of last positions in O(n).

## When to use
Use these techniques for contiguous subarray or substring problems with a monotonic property, where extending the window moves the answer in one direction. Each pointer only moves forward, so total work is O(n).

## Pitfalls
Sliding windows with negative numbers can break monotonic shrinking logic for sum constraints. Forgetting to update state when the left pointer moves is the most common bug.
