---
id: big-o-complexity
title: Time and Space Complexity (Big-O)
domain: foundations
level: beginner
prerequisites: []
tags: [big-o, complexity, asymptotic, runtime, analysis]
---
# Time and Space Complexity (Big-O)

## Overview
Big-O notation describes how an algorithm's running time or memory grows as the input size n grows, ignoring constant factors and lower-order terms. It gives an upper bound, most often used for the worst case. Big-Omega gives a lower bound and Big-Theta a tight bound.

## Common growth rates
From fastest to slowest growth: O(1) constant, O(log n) logarithmic, O(n) linear, O(n log n) linearithmic, O(n^2) quadratic, O(2^n) exponential, O(n!) factorial. Doubling n doubles the work for O(n), quadruples it for O(n^2), and adds only one step for O(log n).

## How to analyze code
Count how many times the dominant operation runs. A single loop over n items is O(n). Two nested loops over n items is O(n^2). A loop that halves the problem each step is O(log n). Sequential blocks add, so O(n) followed by O(n^2) is O(n^2). Drop constants: 3n + 5 is O(n).

## Space complexity
Space complexity counts the extra memory an algorithm uses beyond its input. An in-place reversal uses O(1) extra space. Building a copy of the array uses O(n). Recursion uses stack space proportional to recursion depth.

## Worst, average and amortized
Worst case is the most expensive input, average case is the expected cost over inputs, and amortized cost spreads an occasional expensive operation over many cheap ones. Appending to a dynamic array is O(1) amortized even though a resize costs O(n).

## Pitfalls
Big-O hides constants, so an O(n) algorithm with a huge constant can lose to O(n log n) for realistic n. O(n) does not mean "exactly n steps". Do not confuse worst case with Big-O: Big-O is a bound, and the worst case is a scenario.
