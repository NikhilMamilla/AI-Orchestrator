---
id: hash-table
title: Hash Table
domain: data-structures
level: beginner
prerequisites: [arrays, big-o-complexity]
tags: [hash map, dictionary, hashing, collision, chaining, open addressing, set]
---
# Hash Table

## Overview
A hash table maps keys to values. A hash function converts a key to an integer, which is reduced modulo the table size to pick a bucket index. Lookup, insert and delete are O(1) on average.

## Collisions
Two keys can hash to the same bucket. Chaining stores a small list in each bucket. Open addressing (linear probing, quadratic probing, double hashing) stores the item in another free slot in the array. A good hash function spreads keys uniformly to keep collisions rare.

## Load factor and resizing
The load factor is items divided by buckets. When it exceeds a threshold (for example 0.75) the table doubles in size and rehashes every key. Resizing is O(n) but amortizes to O(1) per insert.

## Complexity
Average case for get, put and delete is O(1). Worst case is O(n) when many keys collide into one bucket, for example with a poor hash function or adversarial input. Hash maps do not keep keys sorted.

## Example: two sum
```python
def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
```
This finds a pair in O(n) time using O(n) space, replacing an O(n^2) double loop.

## Pitfalls
Mutable objects such as lists cannot be dictionary keys because their hash would change. Claiming that hash maps are always O(1) ignores the worst case. Iteration order should not be relied on in languages that do not guarantee it.
