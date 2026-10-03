---
id: string-matching-kmp
title: String Matching (KMP and Rabin-Karp)
domain: advanced-algorithms
level: advanced
prerequisites: [arrays, hash-table]
tags: [string matching, kmp, knuth morris pratt, rabin karp, rolling hash, prefix function, pattern search]
---
# String Matching (KMP and Rabin-Karp)

## The problem
Find all occurrences of a pattern of length m inside a text of length n. The naive method compares the pattern at every position and costs O(n * m) in the worst case, for example text "aaaa...a" with pattern "aaab".

## Knuth-Morris-Pratt (KMP)
KMP avoids re-examining text characters after a mismatch. It precomputes a failure (prefix) function: for each prefix of the pattern, the length of the longest proper prefix that is also a suffix. On a mismatch, the pattern shifts using this table instead of restarting. The total time is O(n + m) and extra space is O(m).

```python
def prefix_function(p):
    pi = [0] * len(p)
    k = 0
    for i in range(1, len(p)):
        while k and p[i] != p[k]:
            k = pi[k - 1]
        if p[i] == p[k]:
            k += 1
        pi[i] = k
    return pi
```

## Rabin-Karp
Rabin-Karp compares a rolling hash of each text window with the pattern's hash. The hash of the next window is computed from the previous one in O(1), by removing the leading character and adding the new one. Expected time is O(n + m); worst case is O(n * m) when many hash collisions force full comparisons. On a hash match, verify the characters to rule out collisions. It extends naturally to searching for multiple patterns.

## Choosing
KMP gives a deterministic linear bound. Rabin-Karp is simple and good for multiple patterns or 2D matching. The Z algorithm is another linear-time method.

## Pitfalls
Off-by-one errors in the failure table, and forgetting to verify matches after a hash hit in Rabin-Karp.
