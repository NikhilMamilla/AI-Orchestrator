---
id: binary-search
title: Binary Search
domain: algorithms
level: beginner
prerequisites: [arrays, big-o-complexity]
tags: [binary search, sorted array, divide and conquer, logarithmic, search]
---
# Binary Search

## Overview
Binary search finds a target in a sorted array by repeatedly comparing it with the middle element and discarding the half that cannot contain the target. Each step halves the search space, so it runs in O(log n) time instead of the O(n) of linear search.

## Why the array must be sorted
The algorithm relies on ordering: if the middle element is smaller than the target, everything to its left is also smaller, so the left half can be eliminated safely. Without sorting, that conclusion is invalid and the algorithm can miss the target.

## Iterative implementation
```python
def binary_search(a, target):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if a[mid] == target:
            return mid
        if a[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
```
Time is O(log n) and space is O(1). A recursive version uses O(log n) stack space.

## Variants
Lower bound finds the first index with a[i] >= target; upper bound finds the first index with a[i] > target. Binary search on the answer applies the same idea to a monotonic yes/no condition, for example finding the minimum capacity that works.

## Pitfalls
Computing mid as (lo + hi) / 2 can overflow in fixed-width integers, so use lo + (hi - lo) / 2. Wrong loop conditions (lo < hi versus lo <= hi) and not shrinking the range (lo = mid instead of mid + 1) cause off-by-one errors and infinite loops. Binary search requires random access, so it is not efficient on a linked list.
