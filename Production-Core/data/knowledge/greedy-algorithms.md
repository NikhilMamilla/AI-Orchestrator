---
id: greedy-algorithms
title: Greedy Algorithms
domain: algorithms
level: intermediate
prerequisites: [sorting-algorithms, big-o-complexity]
tags: [greedy, interval scheduling, huffman, exchange argument, local optimum]
---
# Greedy Algorithms

## Overview
A greedy algorithm builds a solution by repeatedly making the locally best choice, without reconsidering earlier decisions. It is fast and simple, but only correct for problems with the greedy-choice property and optimal substructure.

## Proving correctness
The usual technique is an exchange argument: show that any optimal solution can be transformed, step by step, to include the greedy choice without getting worse. Without such a proof, a greedy idea may be wrong.

## Example: interval scheduling
To select the maximum number of non-overlapping intervals, sort by end time and take each interval that starts after the last chosen one ends.
```python
def max_intervals(intervals):
    intervals.sort(key=lambda x: x[1])
    count, end = 0, float('-inf')
    for s, e in intervals:
        if s >= end:
            count += 1
            end = e
    return count
```
Time is O(n log n), dominated by sorting.

## Other examples
Fractional knapsack by value-to-weight ratio, Huffman coding, Prim's and Kruskal's minimum spanning trees, and Dijkstra's shortest paths (greedy on the closest unvisited vertex).

## Greedy versus dynamic programming
Greedy commits to one choice per step; dynamic programming evaluates all choices. 0/1 knapsack cannot be solved by the ratio greedy, and coin change with arbitrary coin values can fail: coins {1, 3, 4} for amount 6 gives 4 + 1 + 1 greedily but 3 + 3 optimally.

## Pitfalls
Assuming greedy works because it passes small examples, and choosing the wrong sort key (start time instead of end time in interval scheduling).
