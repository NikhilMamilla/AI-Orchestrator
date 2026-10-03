---
id: arrays
title: Arrays
domain: data-structures
level: beginner
prerequisites: [big-o-complexity]
tags: [array, list, contiguous memory, indexing, dynamic array]
---
# Arrays

## Overview
An array stores elements in contiguous memory. Because the address of element i is base + i * element_size, reading or writing any index is O(1). This random access is the defining strength of arrays.

## Operations and cost
- Access by index: O(1).
- Search an unsorted array: O(n) by linear scan.
- Insert or delete at the end: O(1) amortized for a dynamic array.
- Insert or delete in the middle or at the front: O(n), because later elements must shift.
- Traversal: O(n).

## Dynamic arrays
Python lists, Java ArrayList and C++ vector are dynamic arrays. When capacity is full they allocate a larger block (usually double), copy the elements, and continue. A single resize costs O(n), but doubling makes append O(1) amortized.

## Example
```python
arr = [4, 8, 15, 16, 23, 42]
print(arr[2])        # 15, O(1)
arr.append(99)       # O(1) amortized
arr.insert(0, 1)     # O(n): shifts every element right
```

## Pitfalls
Index out of range errors and off-by-one mistakes are the most common bugs: valid indices are 0 to n-1. Copying with slicing creates a new O(n) array. Inserting at the front in a loop turns an O(n) task into O(n^2). Arrays have fixed element types in low-level languages but not in Python.
