---
id: recursion
title: Recursion
domain: foundations
level: beginner
prerequisites: [big-o-complexity]
tags: [recursion, call stack, base case, divide and conquer]
---
# Recursion

## Overview
Recursion solves a problem by having a function call itself on a smaller instance of the same problem. Every correct recursive function has a base case that stops the recursion and a recursive case that moves toward the base case.

## The call stack
Each call pushes a frame holding its parameters and local variables onto the call stack. When a call returns, its frame is popped. The maximum depth of the stack determines the space cost: recursion depth d uses O(d) stack space.

## Example: factorial
```python
def factorial(n):
    if n <= 1:          # base case
        return 1
    return n * factorial(n - 1)   # recursive case
```
factorial(4) expands to 4 * 3 * 2 * 1. It makes n calls, so time is O(n) and stack space is O(n).

## Recursion versus iteration
Any recursion can be rewritten with a loop and an explicit stack. Recursion is clearer for trees, graphs and divide-and-conquer. Iteration avoids call overhead and stack overflow. Fibonacci written naively as fib(n-1) + fib(n-2) is O(2^n) because it recomputes the same subproblems; memoization fixes this and leads into dynamic programming.

## Pitfalls
A missing or unreachable base case causes infinite recursion and a stack overflow (RecursionError in Python, default limit about 1000). Make sure every recursive call makes progress toward the base case. Recursion is not always faster than loops; it usually carries extra overhead from stack frames.
