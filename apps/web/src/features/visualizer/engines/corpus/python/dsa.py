import heapq
from collections import deque, defaultdict, Counter

n, m = map(int, input().split())
adj = defaultdict(list)
for _ in range(m):
    u, v, w = map(int, input().split())
    adj[u].append((v, w))
    adj[v].append((u, w))

dist = [float("inf")] * n
dist[0] = 0
pq = [(0, 0)]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]:
        continue
    for v, w in adj[u]:
        if d + w < dist[v]:
            dist[v] = d + w
            heapq.heappush(pq, (dist[v], v))
print(dist)

seen = [False] * n
order = []
q = deque([0])
seen[0] = True
while q:
    u = q.popleft()
    order.append(u)
    for v, _ in sorted(adj[u]):
        if not seen[v]:
            seen[v] = True
            q.append(v)
print(order)

grid = [[0] * 4 for _ in range(3)]
for i in range(3):
    for j in range(4):
        grid[i][j] = 1 if i == 0 or j == 0 else grid[i - 1][j] + grid[i][j - 1]
print(grid[-1][-1])
cnt = Counter("mississippi")
print(sorted(cnt.items()))
stack = []
for ch in "(()[]{})":
    if ch in "([{":
        stack.append(ch)
    else:
        stack.pop()
print(len(stack) == 0)
