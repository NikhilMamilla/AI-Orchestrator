---
id: backtracking
title: Backtracking
domain: advanced-algorithms
level: advanced
prerequisites: [recursion, depth-first-search]
tags: [backtracking, permutations, subsets, n-queens, pruning, search space]
---
# Backtracking

## Overview
Backtracking builds a solution incrementally and abandons (backtracks from) a partial solution as soon as it cannot lead to a valid answer. It is depth-first search over the space of choices, with pruning to avoid exploring hopeless branches.

## Template
Choose, explore, un-choose:
```python
def subsets(nums):
    res, path = [], []
    def go(i):
        if i == len(nums):
            res.append(path[:])
            return
        go(i + 1)                 # skip nums[i]
        path.append(nums[i])      # choose
        go(i + 1)                 # explore
        path.pop()                # un-choose (backtrack)
    go(0)
    return res
```

## Classic problems
Generating subsets (2^n results), permutations (n! results), combination sum, N-Queens, Sudoku solving, and word search in a grid.

## Pruning
Pruning cuts branches early. In N-Queens, track columns and diagonals in use and skip any square under attack, which reduces the search from n^n placements to a far smaller tree. Sorting the input and skipping equal neighbours avoids duplicate results.

## Complexity
Backtracking is exponential in the worst case, for example O(n!) for permutations; pruning improves the practical running time but not the worst-case bound. Space is O(depth) plus the output.

## Pitfalls
Forgetting to undo a choice, appending the same list object instead of a copy so later changes corrupt stored results, and missing pruning conditions. If subproblems overlap, memoize and use dynamic programming instead.
