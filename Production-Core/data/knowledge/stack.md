---
id: stack
title: Stack
domain: data-structures
level: beginner
prerequisites: [arrays, linked-list]
tags: [stack, lifo, push, pop, parentheses, monotonic stack]
---
# Stack

## Overview
A stack is a last-in, first-out (LIFO) collection. You only add (push) and remove (pop) at one end, the top. Think of a pile of plates: the last plate placed is the first one taken.

## Operations and cost
push, pop and peek (look at the top) are all O(1) when the stack is backed by a dynamic array or a linked list. Checking whether the stack is empty is O(1).

## Where stacks are used
The function call stack, undo and redo, browser back navigation, depth-first search, expression evaluation, and matching brackets.

## Example: balanced parentheses
```python
def is_balanced(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    st = []
    for ch in s:
        if ch in '([{':
            st.append(ch)
        elif ch in pairs:
            if not st or st.pop() != pairs[ch]:
                return False
    return not st
```
Each character is processed once, so time is O(n) and space is O(n).

## Monotonic stack
A monotonic stack keeps elements in increasing or decreasing order. It solves next-greater-element and daily-temperatures problems in O(n) because each element is pushed and popped at most once.

## Pitfalls
Popping from an empty stack raises an error, so check emptiness first. Using a Python list's pop(0) is O(n) and is a queue operation, not a stack operation.
