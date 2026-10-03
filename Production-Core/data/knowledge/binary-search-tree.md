---
id: binary-search-tree
title: Binary Search Tree
domain: data-structures
level: intermediate
prerequisites: [binary-tree, binary-search, recursion]
tags: [bst, binary search tree, balanced, avl, red-black, ordered]
---
# Binary Search Tree

## Overview
A binary search tree (BST) is a binary tree where, for every node, all keys in the left subtree are smaller and all keys in the right subtree are larger. This ordering lets you search by comparing with the current node and going left or right, like binary search.

## Operations and cost
Search, insert and delete take O(h), where h is the tree height. In a balanced tree h is about log n, so operations are O(log n). In a degenerate tree built from sorted insertions h is n and operations degrade to O(n).

```python
def search(node, key):
    if not node or node.val == key:
        return node
    return search(node.left, key) if key < node.val else search(node.right, key)
```

## Deletion
Deleting a leaf removes it. A node with one child is replaced by that child. A node with two children is replaced by its inorder successor (smallest key in the right subtree) or predecessor, and then that node is deleted.

## Inorder gives sorted order
An inorder traversal of a valid BST yields keys in ascending order, which is the basis for validating a BST and finding the k-th smallest element.

## Self-balancing trees
AVL trees and red-black trees rotate nodes after insertions and deletions to keep height O(log n), guaranteeing O(log n) worst-case operations. Standard library ordered maps are typically red-black trees.

## Pitfalls
Validating a BST by only comparing a node with its immediate children is wrong; each node must lie within bounds inherited from all ancestors. Inserting sorted data into a plain BST creates a skewed tree.
