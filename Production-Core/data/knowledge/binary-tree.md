---
id: binary-tree
title: Binary Tree
domain: data-structures
level: intermediate
prerequisites: [recursion, linked-list]
tags: [tree, binary tree, traversal, inorder, preorder, postorder, level order, height]
---
# Binary Tree

## Overview
A binary tree is a hierarchical structure in which each node has at most two children, called left and right. The top node is the root; a node with no children is a leaf. The height is the number of edges on the longest root-to-leaf path.

## Traversals
Depth-first traversals visit nodes recursively: preorder is node, left, right; inorder is left, node, right; postorder is left, right, node. Level-order (breadth-first) visits nodes row by row using a queue. All traversals take O(n) time. Recursive depth-first traversal uses O(h) stack space where h is the height.

```python
def inorder(node):
    if not node:
        return []
    return inorder(node.left) + [node.val] + inorder(node.right)

def height(node):
    return 0 if not node else 1 + max(height(node.left), height(node.right))
```

## Tree shapes
A complete tree fills every level except possibly the last, which fills left to right; heaps are complete trees. A perfect tree has all levels full and 2^h - 1 nodes for h levels. A balanced tree keeps height near log n. A degenerate (skewed) tree behaves like a linked list with height n.

## Common problems
Maximum depth, checking symmetry, lowest common ancestor, path sums and serializing a tree all follow the pattern: handle the null base case, recurse on children, combine the results.

## Pitfalls
Forgetting the null base case, mixing up height measured in nodes versus edges, and assuming a binary tree is ordered (only a binary search tree is).
