---
id: prefix-sum
title: Prefix Sum
domain: algorithms
level: intermediate
prerequisites: [arrays]
tags: [prefix sum, cumulative sum, range query, subarray sum]
---
# Prefix Sum

## Overview
A prefix sum array stores running totals: prefix[i] is the sum of the first i elements. After an O(n) preprocessing pass, the sum of any range [l, r) is prefix[r] - prefix[l], answered in O(1).

## Example
```python
def build(a):
    p = [0]
    for x in a:
        p.append(p[-1] + x)
    return p

def range_sum(p, l, r):      # sum of a[l:r]
    return p[r] - p[l]
```

## Subarray sum equals k
Keep a hash map from prefix-sum value to how many times it has occurred. At each position, the number of subarrays ending here with sum k equals the count of earlier prefix sums equal to current_prefix - k. This runs in O(n) and handles negative numbers, unlike a sliding window.

## Variants
Two-dimensional prefix sums answer rectangle-sum queries in O(1). A difference array is the inverse idea: it applies range updates in O(1) each and is reconstructed with a prefix sum.

## Complexity
Preprocessing is O(n) time and O(n) space. Each query is O(1).

## Pitfalls
Off-by-one errors with inclusive versus exclusive ranges, and forgetting the leading zero entry that makes ranges starting at index 0 work.
