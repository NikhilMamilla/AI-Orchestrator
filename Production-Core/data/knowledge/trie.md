---
id: trie
title: Trie (Prefix Tree)
domain: data-structures
level: advanced
prerequisites: [binary-tree, hash-table]
tags: [trie, prefix tree, autocomplete, strings, dictionary words]
---
# Trie (Prefix Tree)

## Overview
A trie stores a set of strings in a tree where each edge is labelled with a character and each path from the root spells a prefix. A flag on a node marks the end of a complete word. Words that share a prefix share the nodes for that prefix.

## Operations and cost
Insert, search and prefix check each take O(L), where L is the length of the string, independent of how many words are stored. A hash set also gives O(L) lookups (hashing the string) but cannot answer prefix queries efficiently; a trie can.

```python
class Trie:
    def __init__(self):
        self.root = {}

    def insert(self, word):
        node = self.root
        for ch in word:
            node = node.setdefault(ch, {})
        node['$'] = True

    def starts_with(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node:
                return False
            node = node[ch]
        return True
```

## Applications
Autocomplete and typeahead, spell checking, longest common prefix, word search in a grid with pruning, and IP routing (binary tries).

## Space
Worst-case space is O(total characters) across all words. Using an array of 26 children per node is fast but memory heavy; a dictionary per node saves space for sparse alphabets. A compressed trie (radix tree) merges chains of single-child nodes.

## Pitfalls
Confusing a prefix with a complete word (the end-of-word flag matters), and memory blow-up from per-node arrays.
