---
id: sorting-algorithms
title: Sorting Algorithms
domain: algorithms
level: intermediate
prerequisites: [arrays, recursion, big-o-complexity]
tags: [sorting, bubble sort, merge sort, quick sort, stable, comparison sort]
---
# Sorting Algorithms

## Overview
Sorting arranges elements in order. Comparison-based sorts cannot beat O(n log n) in the worst case. Two properties matter: stability (equal elements keep their original relative order) and whether the sort is in-place.

## Bubble sort
Repeatedly swaps adjacent out-of-order elements. It is O(n^2) in the average and worst case, O(n) on already sorted input with an early-exit flag, in-place and stable. It is mainly educational.

## Insertion sort
Builds the sorted prefix by inserting each element into place. O(n^2) worst case but O(n) on nearly sorted data, so it is used for small arrays. In-place and stable.

## Merge sort
Divide and conquer: split the array in half, sort each half recursively, then merge the two sorted halves. Time is O(n log n) in every case. It needs O(n) extra space and is stable.

```python
def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    l, r = merge_sort(a[:mid]), merge_sort(a[mid:])
    out, i, j = [], 0, 0
    while i < len(l) and j < len(r):
        if l[i] <= r[j]:
            out.append(l[i]); i += 1
        else:
            out.append(r[j]); j += 1
    return out + l[i:] + r[j:]
```

## Quick sort
Choose a pivot, partition the array so smaller elements are on the left and larger on the right, then recurse on both sides. Average time is O(n log n), worst case O(n^2) when the pivot is consistently the smallest or largest element, for example a sorted array with a naive first-element pivot. A random or median-of-three pivot makes the worst case unlikely. It is in-place with O(log n) stack space and is not stable.

## Choosing
Use the built-in sort (Timsort in Python, a stable hybrid of merge and insertion sort) in practice. Counting sort and radix sort run in linear time for bounded integer keys.

## Pitfalls
Assuming quick sort is always O(n log n), and forgetting that merge sort needs extra memory.
