class Node:
    def __init__(self, val, nxt=None):
        self.val = val
        self.next = nxt


class TreeNode:
    __slots__ = ("key", "left", "right")

    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(root, key):
    if root is None:
        return TreeNode(key)
    if key < root.key:
        root.left = insert(root.left, key)
    else:
        root.right = insert(root.right, key)
    return root


def inorder(root, out):
    if root:
        inorder(root.left, out)
        out.append(root.key)
        inorder(root.right, out)


def reverse(head):
    prev, cur = None, head
    while cur:
        cur.next, prev, cur = prev, cur, cur.next
    return prev


n = int(input())
values = list(map(int, input().split()))
head = None
for v in reversed(values):
    head = Node(v, head)
head = reverse(head)
parts = []
p = head
while p:
    parts.append(str(p.val))
    p = p.next
print(" -> ".join(parts))
root = None
for v in values:
    root = insert(root, v)
keys = []
inorder(root, keys)
print(keys)
a = Node(1)
b = Node(2, a)
a.next = b
print(a.next.next is a, b.next.val)
