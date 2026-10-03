---
id: dynamic-programming
title: Dynamic Programming
domain: advanced-algorithms
level: advanced
prerequisites: [recursion, big-o-complexity, arrays]
tags: [dynamic programming, dp, memoization, tabulation, overlapping subproblems, optimal substructure, knapsack]
---
# Dynamic Programming

## Overview
Dynamic programming (DP) solves problems by breaking them into overlapping subproblems and storing each subproblem's answer so it is computed only once. A problem is a DP candidate when it has optimal substructure (the optimal solution is built from optimal solutions to subproblems) and overlapping subproblems (the same subproblems recur).

## Memoization (top-down)
Write the natural recursion and cache results. Naive Fibonacci is O(2^n); with a cache it is O(n).

```python
from functools import lru_cache

@lru_cache(None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

## Tabulation (bottom-up)
Fill a table iteratively from the smallest subproblems upward. It avoids recursion overhead and often allows space reduction, for example keeping only the previous row.

## How to design a DP
1. Define the state: what parameters identify a subproblem.
2. Write the recurrence relating a state to smaller states.
3. Set the base cases.
4. Choose the evaluation order and the answer cell.
Complexity is the number of states multiplied by the work per state.

## Classic problems
0/1 knapsack, longest common subsequence, longest increasing subsequence, edit distance, coin change and climbing stairs. For coin change, dp[a] = min(dp[a - c] + 1) over coins c, in O(amount * coins).

## DP versus greedy and divide and conquer
Divide and conquer subproblems do not overlap, as in merge sort. Greedy makes one local choice without revisiting it. DP considers all choices and reuses results.

## Pitfalls
Wrong or incomplete state definitions, missing base cases, and mistaking a problem that needs backtracking for one with overlapping subproblems.
