---
id: bit-manipulation
title: Bit Manipulation
domain: foundations
level: intermediate
prerequisites: [big-o-complexity]
tags: [bit manipulation, bitwise, xor, and, or, shift, bitmask, power of two]
---
# Bit Manipulation

## Overview
Bit manipulation works directly on the binary representation of integers using the operators AND (&), OR (|), XOR (^), NOT (~) and shifts (<<, >>). Operations run in O(1) and are useful for compact state and for fast tricks.

## Core operations
- Check bit i: (x >> i) & 1.
- Set bit i: x | (1 << i).
- Clear bit i: x & ~(1 << i).
- Toggle bit i: x ^ (1 << i).
- Left shift by k multiplies by 2^k; right shift by k divides by 2^k (floor).

## Useful tricks
A positive integer x is a power of two if x & (x - 1) == 0, because subtracting 1 flips the lowest set bit and all bits below it. The expression x & (x - 1) clears the lowest set bit, so repeating it counts set bits in O(number of set bits) (Brian Kernighan's algorithm). x & -x isolates the lowest set bit.

## XOR properties
x ^ x = 0, x ^ 0 = x, and XOR is commutative and associative. XOR-ing all numbers in an array where every value appears twice except one leaves the single unique value, in O(n) time and O(1) space.

## Bitmasks
An integer can represent a subset of up to about 30 or 60 items, one bit per item. Iterating mask from 0 to 2^n - 1 enumerates all subsets, which is also the basis of bitmask dynamic programming.

## Pitfalls
Operator precedence (use parentheses: & and | bind more loosely than ==), shifting by a negative amount or by at least the word size, and sign behaviour of right shifts on negative numbers. Python integers have arbitrary precision, so ~x equals -x - 1 rather than a fixed-width complement.
