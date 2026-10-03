"""Builds data/challenges/challenges.json from reference solutions.

Expected outputs are computed by RUNNING the reference solution on each input (never typed by hand), so a test can
never disagree with its own reference. `scripts/verify_challenges.py` then checks every reference passes and every
buggy starter fails in the real Judge0 sandbox.

    python scripts/build_challenges.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

C = []


def add(id, concept, kind, title, prompt, starter, reference, inputs, hint):
    C.append(dict(id=id, concept=concept, kind=kind, title=title, prompt=prompt, starter=starter.strip("\n") + "\n",
                  reference=reference.strip("\n") + "\n", inputs=inputs, hint=hint))


add("bs-off-by-one", "binary-search", "debug", "Fix the binary search",
    "This program reads a sorted list of integers on line 1 and a target on line 2, and prints the index of the target "
    "or -1. It sometimes misses elements that are in the list. Find and fix the bug.",
    '''
a = list(map(int, input().split()))
t = int(input())
lo, hi = 0, len(a) - 1
while lo < hi:
    mid = (lo + hi) // 2
    if a[mid] == t:
        print(mid)
        break
    if a[mid] < t:
        lo = mid + 1
    else:
        hi = mid - 1
else:
    print(-1)
''', '''
a = list(map(int, input().split()))
t = int(input())
lo, hi = 0, len(a) - 1
while lo <= hi:
    mid = (lo + hi) // 2
    if a[mid] == t:
        print(mid)
        break
    if a[mid] < t:
        lo = mid + 1
    else:
        hi = mid - 1
else:
    print(-1)
''', ["1 3 5 7 9 11\n7\n", "1 3 5 7 9 11\n1\n", "1 3 5 7 9 11\n11\n", "5\n5\n", "1 3 5 7\n4\n", "2 4 6 8 10\n10\n"],
    "Check the loop condition: when lo equals hi there is still one candidate left to examine.")

add("rotate-array", "arrays", "write", "Rotate an array",
    "Read an array of integers on line 1 and k on line 2. Print the array rotated to the right by k positions "
    "(k can be larger than the length), space separated.",
    '''
a = list(map(int, input().split()))
k = int(input())
# write your solution here
print(*a)
''', '''
a = list(map(int, input().split()))
k = int(input()) % len(a)
print(*(a[-k:] + a[:-k] if k else a))
''', ["1 2 3 4 5\n2\n", "1 2 3\n0\n", "1 2 3\n3\n", "1 2 3 4\n9\n", "7\n100\n"],
    "Rotating by k is the same as rotating by k modulo the length. Slicing the end and the start works.")

add("balanced-brackets", "stack", "write", "Balanced brackets",
    "Read a string made of ()[]{} characters. Print YES if every bracket is closed in the correct order, otherwise NO. "
    "An empty line is balanced.",
    '''
s = input()
# write your solution here
print("YES")
''', '''
s = input()
pairs = {")": "(", "]": "[", "}": "{"}
st = []
ok = True
for ch in s:
    if ch in "([{":
        st.append(ch)
    elif ch in pairs:
        if not st or st.pop() != pairs[ch]:
            ok = False
            break
print("YES" if ok and not st else "NO")
''', ["()[]{}\n", "([{}])\n", "(]\n", "((\n", "\n", "{[}]\n", ")(\n"],
    "Push opening brackets; on a closing bracket the top of the stack must be its partner.")

add("two-sum-indices", "hash-table", "write", "Two sum",
    "Read an array on line 1 and a target on line 2. Print the two indices i and j (i < j) of the first pair that sums "
    "to the target, scanning j from left to right, or -1 if none exists. Aim for a single pass.",
    '''
a = list(map(int, input().split()))
t = int(input())
# write your solution here
print(-1)
''', '''
a = list(map(int, input().split()))
t = int(input())
seen = {}
for j, v in enumerate(a):
    if t - v in seen:
        print(seen[t - v], j)
        break
    seen[v] = j
else:
    print(-1)
''', ["2 7 11 15\n9\n", "3 2 4\n6\n", "1 2 3\n7\n", "3 3\n6\n", "5 1 4 2 3\n6\n"],
    "Store each value's index in a dictionary; for each new value look up target minus value.")

add("reverse-linked-list", "linked-list", "debug", "Fix the list reversal",
    "The program builds a singly linked list from line 1, reverses it in place and prints it. The output is wrong "
    "for lists with more than one element. Fix the reversal.",
    '''
class Node:
    def __init__(self, v):
        self.v, self.next = v, None

vals = list(map(int, input().split()))
head = None
for v in reversed(vals):
    n = Node(v)
    n.next = head
    head = n

prev, cur = None, head
while cur:
    cur.next = prev
    prev = cur
    cur = cur.next
head = prev

out = []
while head:
    out.append(head.v)
    head = head.next
print(*out)
''', '''
class Node:
    def __init__(self, v):
        self.v, self.next = v, None

vals = list(map(int, input().split()))
head = None
for v in reversed(vals):
    n = Node(v)
    n.next = head
    head = n

prev, cur = None, head
while cur:
    nxt = cur.next
    cur.next = prev
    prev = cur
    cur = nxt
head = prev

out = []
while head:
    out.append(head.v)
    head = head.next
print(*out)
''', ["1 2 3 4\n", "1\n", "5 4\n", "9 8 7 6 5 4\n"],
    "After you overwrite cur.next you have lost the rest of the list: save it first.")

add("longest-unique-substring", "two-pointers-sliding-window", "write", "Longest substring without repeats",
    "Read a string. Print the length of its longest substring with no repeated character.",
    '''
s = input()
# write your solution here
print(0)
''', '''
s = input()
last, start, best = {}, 0, 0
for i, ch in enumerate(s):
    if ch in last and last[ch] >= start:
        start = last[ch] + 1
    last[ch] = i
    best = max(best, i - start + 1)
print(best)
''', ["abcabcbb\n", "bbbbb\n", "pwwkew\n", "\n", "abcdef\n", "dvdf\n"],
    "Keep a window [start, i] with no repeats; when ch repeats inside the window, move start past its last position.")

add("digit-sum-recursion", "recursion", "debug", "Fix the recursion",
    "This should print the sum of the digits of a non-negative integer using recursion, but it crashes with a "
    "RecursionError. Fix it.",
    '''
def digit_sum(n):
    return n % 10 + digit_sum(n // 10)

print(digit_sum(int(input())))
''', '''
def digit_sum(n):
    if n == 0:
        return 0
    return n % 10 + digit_sum(n // 10)

print(digit_sum(int(input())))
''', ["123\n", "0\n", "9\n", "99999\n", "1000000\n"],
    "Every recursion needs a base case that stops it. What is the digit sum of 0?")

add("range-sum", "prefix-sum", "write", "Range sum queries",
    "Line 1 has the array. Line 2 has q. The next q lines each have l r (0-indexed, inclusive). Print the sum of "
    "a[l..r] for each query on its own line. Use a prefix-sum array so each query is O(1).",
    '''
a = list(map(int, input().split()))
q = int(input())
for _ in range(q):
    l, r = map(int, input().split())
    # answer the query here
    print(0)
''', '''
a = list(map(int, input().split()))
pre = [0]
for v in a:
    pre.append(pre[-1] + v)
q = int(input())
for _ in range(q):
    l, r = map(int, input().split())
    print(pre[r + 1] - pre[l])
''', ["1 2 3 4 5\n3\n0 4\n1 3\n2 2\n", "5\n1\n0 0\n", "-1 4 -2 7\n2\n0 3\n1 2\n", "10 20 30\n3\n0 0\n0 2\n1 2\n"],
    "pre[i] = sum of the first i values, so a[l..r] = pre[r+1] - pre[l].")

add("bubble-sort-bug", "sorting-algorithms", "debug", "Fix the bubble sort",
    "The program should print the numbers in ascending order using bubble sort, but some inputs come out unsorted. "
    "Fix the bug.",
    '''
a = list(map(int, input().split()))
n = len(a)
for i in range(n - 1):
    for j in range(n - 2 - i):
        if a[j] > a[j + 1]:
            a[j], a[j + 1] = a[j + 1], a[j]
print(*a)
''', '''
a = list(map(int, input().split()))
n = len(a)
for i in range(n - 1):
    for j in range(n - 1 - i):
        if a[j] > a[j + 1]:
            a[j], a[j + 1] = a[j + 1], a[j]
print(*a)
''', ["5 2 9 1 7\n", "1 2 3\n", "3 2 1\n", "4 4 1 4\n", "2 1\n"],
    "On pass i the inner loop must still compare every adjacent pair that is not yet in its final place.")

add("min-coins", "dynamic-programming", "write", "Fewest coins",
    "Line 1 has the coin values, line 2 the amount. Print the fewest coins that sum to the amount (unlimited copies of "
    "each coin), or -1 if impossible. A greedy choice is not always correct.",
    '''
coins = list(map(int, input().split()))
amount = int(input())
# write your solution here
print(-1)
''', '''
coins = list(map(int, input().split()))
amount = int(input())
INF = amount + 1
dp = [0] + [INF] * amount
for x in range(1, amount + 1):
    for c in coins:
        if c <= x and dp[x - c] + 1 < dp[x]:
            dp[x] = dp[x - c] + 1
print(dp[amount] if dp[amount] != INF else -1)
''', ["1 2 5\n11\n", "2\n3\n", "1 3 4\n6\n", "5 10 25\n0\n", "186 419 83 408\n6249\n"],
    "dp[x] = 1 + min(dp[x - c]) over coins c <= x. For coins 1, 3, 4 and amount 6, greedy gives 3 coins but 2 is possible.")

add("bfs-distance", "breadth-first-search", "write", "Shortest path by BFS",
    "Line 1: n and m. Next m lines: an undirected edge u v (nodes are 0..n-1). Last line: source and target. Print the "
    "fewest edges on a path from source to target, or -1 if unreachable.",
    '''
n, m = map(int, input().split())
adj = [[] for _ in range(n)]
for _ in range(m):
    u, v = map(int, input().split())
    adj[u].append(v)
    adj[v].append(u)
s, t = map(int, input().split())
# write your solution here
print(-1)
''', '''
from collections import deque
n, m = map(int, input().split())
adj = [[] for _ in range(n)]
for _ in range(m):
    u, v = map(int, input().split())
    adj[u].append(v)
    adj[v].append(u)
s, t = map(int, input().split())
dist = {s: 0}
q = deque([s])
while q:
    u = q.popleft()
    for w in adj[u]:
        if w not in dist:
            dist[w] = dist[u] + 1
            q.append(w)
print(dist.get(t, -1))
''', ["5 4\n0 1\n1 2\n2 3\n3 4\n0 4\n", "4 2\n0 1\n2 3\n0 3\n", "3 3\n0 1\n1 2\n0 2\n0 2\n", "1 0\n0 0\n", "6 7\n0 1\n0 2\n1 3\n2 3\n3 4\n4 5\n2 5\n0 5\n"],
    "Breadth-first search visits nodes in order of distance, so the first time you reach the target is the shortest path.")


def run(code: str, stdin: str) -> str:
    r = subprocess.run([sys.executable, "-c", code], input=stdin, capture_output=True, text=True, timeout=20)
    if r.returncode != 0:
        raise SystemExit(f"reference crashed:\n{r.stderr}")
    return r.stdout


def main() -> None:
    out = []
    for c in C:
        tests = [{"input": i, "output": run(c["reference"], i)} for i in c["inputs"]]
        # the buggy/starting program must FAIL at least one test, or the challenge is meaningless
        starter_pass = [run_safe(c["starter"], t["input"]) == t["output"] for t in tests]
        if all(starter_pass):
            raise SystemExit(f"{c['id']}: starter already passes every test")
        out.append({"id": c["id"], "concept": c["concept"], "kind": c["kind"], "title": c["title"], "prompt": c["prompt"],
                    "starter": c["starter"], "hint": c["hint"], "tests": tests, "reference": c["reference"]})
        print(f"{c['id']:26s} {len(tests)} tests; starter passes {sum(starter_pass)}/{len(tests)}")
    dest = ROOT / "data" / "challenges"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "challenges.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("wrote", dest / "challenges.json")


def run_safe(code: str, stdin: str) -> str:
    try:
        r = subprocess.run([sys.executable, "-c", code], input=stdin, capture_output=True, text=True, timeout=10)
        return r.stdout if r.returncode == 0 else "<<crash>>"
    except subprocess.TimeoutExpired:
        return "<<timeout>>"


if __name__ == "__main__":
    main()
