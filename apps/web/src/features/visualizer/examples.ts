import type { VisualizerLanguage } from './trace'

export type ExampleCategory =
  'arrays' | 'sorting' | 'stacks' | 'linked' | 'graphs' | 'recursion' | 'bugs'

export const exampleCategories: { id: ExampleCategory; label: string }[] = [
  { id: 'arrays', label: 'Arrays & pointers' },
  { id: 'sorting', label: 'Searching & sorting' },
  { id: 'stacks', label: 'Stacks, queues & heaps' },
  { id: 'linked', label: 'Linked lists & trees' },
  { id: 'graphs', label: 'Graphs & grids' },
  { id: 'recursion', label: 'Recursion & DP' },
  { id: 'bugs', label: 'Find the bug' },
]

// The picture an example card shows.
export type ExampleVisual =
  | 'cells'
  | 'bars'
  | 'stack'
  | 'queue'
  | 'heap'
  | 'list'
  | 'tree'
  | 'graph'
  | 'grid'
  | 'cube'
  | 'calls'
  | 'map'
  | 'bug'

export type ExampleProgram = {
  id: string
  title: string
  blurb: string
  category: ExampleCategory
  visual: ExampleVisual
  code: Partial<Record<VisualizerLanguage, string>>
  input: string
  expected: string
  // The program is wrong on purpose: its output differs from `expected` or
  // it stops with an error.
  bug?: boolean
}

// A single runnable example, as the page loads it.
export type VisualizerExample = {
  id: string
  title: string
  language: VisualizerLanguage
  code: string
  input: string
  expected: string
}

export const examplePrograms: readonly ExampleProgram[] = [
  {
    id: 'two-pointers',
    title: 'Two pointers',
    blurb:
      'Find a pair with a given sum in a sorted array; watch l and r close in.',
    category: 'arrays',
    visual: 'cells',
    input: '6 13\n1 3 4 6 9 11\n',
    expected: '2 4\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, target;
    cin >> n >> target;
    vector<int> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];

    int l = 0, r = n - 1;
    while (l < r) {
        int sum = a[l] + a[r];
        if (sum == target) {
            cout << l << " " << r << "\\n";
            return 0;
        }
        if (sum < target) l++;
        else r--;
    }
    cout << -1 << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), target = in.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = in.nextInt();

        int l = 0, r = n - 1;
        while (l < r) {
            int sum = a[l] + a[r];
            if (sum == target) {
                System.out.println(l + " " + r);
                return;
            }
            if (sum < target) l++;
            else r--;
        }
        System.out.println(-1);
    }
}
`,
      python: `n, target = map(int, input().split())
a = list(map(int, input().split()))

l, r = 0, n - 1
answer = -1
while l < r:
    s = a[l] + a[r]
    if s == target:
        answer = (l, r)
        break
    if s < target:
        l += 1
    else:
        r -= 1
if answer == -1:
    print(-1)
else:
    print(*answer)
`,
    },
  },
  {
    id: 'sliding-window',
    title: 'Sliding window',
    blurb: 'Longest stretch with sum at most k; the window grows and shrinks.',
    category: 'arrays',
    visual: 'cells',
    input: '8 7\n2 1 3 4 1 1 2 5\n',
    expected: '3\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, k;
    cin >> n >> k;
    vector<int> a(n);
    for (auto& x : a) cin >> x;

    int left = 0, sum = 0, best = 0;
    for (int right = 0; right < n; right++) {
        sum += a[right];
        while (sum > k) {
            sum -= a[left];
            left++;
        }
        best = max(best, right - left + 1);
    }
    cout << best << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), k = in.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = in.nextInt();

        int left = 0, sum = 0, best = 0;
        for (int right = 0; right < n; right++) {
            sum += a[right];
            while (sum > k) {
                sum -= a[left];
                left++;
            }
            best = Math.max(best, right - left + 1);
        }
        System.out.println(best);
    }
}
`,
      python: `n, k = map(int, input().split())
a = list(map(int, input().split()))

left = total = best = 0
for right in range(n):
    total += a[right]
    while total > k:
        total -= a[left]
        left += 1
    best = max(best, right - left + 1)
print(best)
`,
    },
  },
  {
    id: 'binary-search',
    title: 'Binary search',
    blurb: 'First element ≥ x; each step halves the range between lo and hi.',
    category: 'sorting',
    visual: 'bars',
    input: '12 40\n4 9 13 17 21 23 33 38 40 44 54 69\n',
    expected: '8\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, x;
    cin >> n >> x;
    vector<int> a(n);
    for (auto& v : a) cin >> v;

    int lo = 0, hi = n;  // the answer is in [lo, hi]
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] >= x) hi = mid;
        else lo = mid + 1;
    }
    cout << lo << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), x = in.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = in.nextInt();

        int lo = 0, hi = n;  // the answer is in [lo, hi]
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] >= x) hi = mid;
            else lo = mid + 1;
        }
        System.out.println(lo);
    }
}
`,
      python: `n, x = map(int, input().split())
a = list(map(int, input().split()))

lo, hi = 0, n  # the answer is in [lo, hi]
while lo < hi:
    mid = (lo + hi) // 2
    if a[mid] >= x:
        hi = mid
    else:
        lo = mid + 1
print(lo)
`,
    },
  },
  {
    id: 'bubble-sort',
    title: 'Bubble sort',
    blurb: 'Neighbours swap until the largest values bubble to the end.',
    category: 'sorting',
    visual: 'bars',
    input: '7\n5 1 4 2 8 3 7\n',
    expected: '1 2 3 4 5 7 8\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (auto& x : a) cin >> x;

    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j + 1 < n - i; j++) {
            if (a[j] > a[j + 1]) swap(a[j], a[j + 1]);
        }
    }
    for (int x : a) cout << x << " ";
    cout << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = in.nextInt();

        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j + 1 < n - i; j++) {
                if (a[j] > a[j + 1]) {
                    int t = a[j];
                    a[j] = a[j + 1];
                    a[j + 1] = t;
                }
            }
        }
        StringBuilder out = new StringBuilder();
        for (int x : a) out.append(x).append(' ');
        System.out.println(out);
    }
}
`,
      python: `n = int(input())
a = list(map(int, input().split()))

for i in range(n - 1):
    for j in range(n - 1 - i):
        if a[j] > a[j + 1]:
            a[j], a[j + 1] = a[j + 1], a[j]
print(*a, "")
`,
    },
  },
  {
    id: 'valid-brackets',
    title: 'Balanced brackets',
    blurb: 'Push opening brackets, pop on a match; the stack tells the answer.',
    category: 'stacks',
    visual: 'stack',
    input: '{[()()]}\n',
    expected: 'YES\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    cin >> s;
    stack<char> st;
    bool ok = true;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            st.push(c);
        } else {
            char open = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (st.empty() || st.top() != open) { ok = false; break; }
            st.pop();
        }
    }
    cout << (ok && st.empty() ? "YES" : "NO") << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        String s = new Scanner(System.in).next();
        Deque<Character> stack = new ArrayDeque<>();
        boolean ok = true;
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                stack.push(c);
            } else {
                char open = c == ')' ? '(' : c == ']' ? '[' : '{';
                if (stack.isEmpty() || stack.peek() != open) { ok = false; break; }
                stack.pop();
            }
        }
        System.out.println(ok && stack.isEmpty() ? "YES" : "NO");
    }
}
`,
      python: `s = input().strip()
pairs = {")": "(", "]": "[", "}": "{"}
stack = []
ok = True
for c in s:
    if c in "([{":
        stack.append(c)
    elif not stack or stack[-1] != pairs[c]:
        ok = False
        break
    else:
        stack.pop()
print("YES" if ok and not stack else "NO")
`,
    },
  },
  {
    id: 'queue-simulation',
    title: 'Queue: ticket line',
    blurb: 'People join at the back and are served from the front (FIFO).',
    category: 'stacks',
    visual: 'queue',
    input: '5\n3 1 2 1 2\n',
    expected: '9\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

// Each person wants t[i] tickets and buys one per turn.
// How many turns until everyone is done?
int main() {
    int n;
    cin >> n;
    queue<int> line;
    for (int i = 0; i < n; i++) {
        int t;
        cin >> t;
        line.push(t);
    }
    int turns = 0;
    while (!line.empty()) {
        int wants = line.front();
        line.pop();
        turns++;
        if (wants > 1) line.push(wants - 1);
    }
    cout << turns << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    // Each person wants t[i] tickets and buys one per turn.
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        Queue<Integer> line = new LinkedList<>();
        for (int i = 0; i < n; i++) line.add(in.nextInt());
        int turns = 0;
        while (!line.isEmpty()) {
            int wants = line.poll();
            turns++;
            if (wants > 1) line.add(wants - 1);
        }
        System.out.println(turns);
    }
}
`,
      python: `from collections import deque

# Each person wants t[i] tickets and buys one per turn.
n = int(input())
line = deque(map(int, input().split()))
turns = 0
while line:
    wants = line.popleft()
    turns += 1
    if wants > 1:
        line.append(wants - 1)
print(turns)
`,
    },
  },
  {
    id: 'top-k',
    title: 'Heap: k smallest',
    blurb: 'A priority queue always hands out the smallest value first.',
    category: 'stacks',
    visual: 'heap',
    input: '8 3\n9 4 7 1 8 2 6 5\n',
    expected: '1 2 4\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, k;
    cin >> n >> k;
    priority_queue<int, vector<int>, greater<int>> pq;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        pq.push(x);
    }
    for (int i = 0; i < k; i++) {
        cout << pq.top() << (i + 1 < k ? " " : "\\n");
        pq.pop();
    }
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), k = in.nextInt();
        PriorityQueue<Integer> pq = new PriorityQueue<>();
        for (int i = 0; i < n; i++) pq.add(in.nextInt());
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < k; i++) {
            out.append(pq.poll());
            if (i + 1 < k) out.append(' ');
        }
        System.out.println(out);
    }
}
`,
      python: `import heapq

n, k = map(int, input().split())
heap = []
for x in map(int, input().split()):
    heapq.heappush(heap, x)
smallest = [heapq.heappop(heap) for _ in range(k)]
print(*smallest)
`,
    },
  },
  {
    id: 'reverse-list',
    title: 'Reverse a linked list',
    blurb: 'prev, cur and next walk the list and flip every arrow.',
    category: 'linked',
    visual: 'list',
    input: '5\n1 2 3 4 5\n',
    expected: '5 4 3 2 1\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

struct Node {
    int val;
    Node* next;
    Node(int v) : val(v), next(nullptr) {}
};

int main() {
    int n;
    cin >> n;
    Node* head = nullptr;
    Node* tail = nullptr;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        Node* node = new Node(x);
        if (head == nullptr) head = tail = node;
        else { tail->next = node; tail = node; }
    }

    Node* prev = nullptr;
    Node* cur = head;
    while (cur != nullptr) {
        Node* next = cur->next;
        cur->next = prev;
        prev = cur;
        cur = next;
    }
    head = prev;

    for (Node* p = head; p != nullptr; p = p->next) cout << p->val << " ";
    cout << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    static class Node {
        int val;
        Node next;
        Node(int val) { this.val = val; }
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        Node head = null, tail = null;
        for (int i = 0; i < n; i++) {
            Node node = new Node(in.nextInt());
            if (head == null) head = tail = node;
            else { tail.next = node; tail = node; }
        }

        Node prev = null, cur = head;
        while (cur != null) {
            Node next = cur.next;
            cur.next = prev;
            prev = cur;
            cur = next;
        }
        head = prev;

        StringBuilder out = new StringBuilder();
        for (Node p = head; p != null; p = p.next) out.append(p.val).append(' ');
        System.out.println(out);
    }
}
`,
      python: `class Node:
    def __init__(self, val):
        self.val = val
        self.next = None


n = int(input())
head = tail = None
for x in map(int, input().split()):
    node = Node(x)
    if head is None:
        head = tail = node
    else:
        tail.next = node
        tail = node

prev, cur = None, head
while cur:
    nxt = cur.next
    cur.next = prev
    prev = cur
    cur = nxt
head = prev

p = head
values = []
while p:
    values.append(p.val)
    p = p.next
print(*values, "")
`,
    },
  },
  {
    id: 'bst',
    title: 'Binary search tree',
    blurb: 'Insert keys, then walk the tree in order to print them sorted.',
    category: 'linked',
    visual: 'tree',
    input: '7\n12 8 18 5 11 17 4\n',
    expected: '4 5 8 11 12 17 18\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

struct Node {
    int key;
    Node* left;
    Node* right;
    Node(int k) : key(k), left(nullptr), right(nullptr) {}
};

Node* insert(Node* root, int key) {
    if (root == nullptr) return new Node(key);
    if (key < root->key) root->left = insert(root->left, key);
    else root->right = insert(root->right, key);
    return root;
}

void inorder(Node* root) {
    if (root == nullptr) return;
    inorder(root->left);
    cout << root->key << " ";
    inorder(root->right);
}

int main() {
    int n;
    cin >> n;
    Node* root = nullptr;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        root = insert(root, x);
    }
    inorder(root);
    cout << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    static class Node {
        int key;
        Node left, right;
        Node(int key) { this.key = key; }
    }

    static Node insert(Node root, int key) {
        if (root == null) return new Node(key);
        if (key < root.key) root.left = insert(root.left, key);
        else root.right = insert(root.right, key);
        return root;
    }

    static void inorder(Node root, StringBuilder out) {
        if (root == null) return;
        inorder(root.left, out);
        out.append(root.key).append(' ');
        inorder(root.right, out);
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        Node root = null;
        for (int i = 0; i < n; i++) root = insert(root, in.nextInt());
        StringBuilder out = new StringBuilder();
        inorder(root, out);
        System.out.println(out);
    }
}
`,
      python: `class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(root, key):
    if root is None:
        return Node(key)
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


n = int(input())
root = None
for x in map(int, input().split()):
    root = insert(root, x)
keys = []
inorder(root, keys)
print(*keys, "")
`,
    },
  },
  {
    id: 'graph-bfs',
    title: 'BFS on a graph',
    blurb:
      'Visit nodes level by level; see the queue, visited nodes and distances.',
    category: 'graphs',
    visual: 'graph',
    input: '6 7\n0 1\n0 2\n1 3\n2 3\n3 4\n4 5\n2 5\n',
    expected: '0 1 1 2 3 2\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<int>> adj(n);
    for (int i = 0; i < m; i++) {
        int a, b;
        cin >> a >> b;
        adj[a].push_back(b);
        adj[b].push_back(a);
    }

    vector<int> dist(n, -1);
    queue<int> q;
    dist[0] = 0;
    q.push(0);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    for (int d : dist) cout << d << " ";
    cout << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), m = in.nextInt();
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int i = 0; i < m; i++) {
            int a = in.nextInt(), b = in.nextInt();
            adj.get(a).add(b);
            adj.get(b).add(a);
        }

        int[] dist = new int[n];
        Arrays.fill(dist, -1);
        Queue<Integer> q = new ArrayDeque<>();
        dist[0] = 0;
        q.add(0);
        while (!q.isEmpty()) {
            int u = q.poll();
            for (int v : adj.get(u)) {
                if (dist[v] == -1) {
                    dist[v] = dist[u] + 1;
                    q.add(v);
                }
            }
        }
        StringBuilder out = new StringBuilder();
        for (int d : dist) out.append(d).append(' ');
        System.out.println(out.toString().trim());
    }
}
`,
      python: `from collections import deque

n, m = map(int, input().split())
adj = [[] for _ in range(n)]
for _ in range(m):
    a, b = map(int, input().split())
    adj[a].append(b)
    adj[b].append(a)

dist = [-1] * n
q = deque([0])
dist[0] = 0
while q:
    u = q.popleft()
    for v in adj[u]:
        if dist[v] == -1:
            dist[v] = dist[u] + 1
            q.append(v)
print(*dist)
`,
    },
  },
  {
    id: 'dfs-components',
    title: 'DFS: connected components',
    blurb: 'Depth-first search marks everything reachable before moving on.',
    category: 'graphs',
    visual: 'graph',
    input: '7 4\n0 1\n1 2\n3 4\n5 6\n',
    expected: '3\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> adj;
vector<bool> visited;

void dfs(int u) {
    visited[u] = true;
    for (int v : adj[u])
        if (!visited[v]) dfs(v);
}

int main() {
    int n, m;
    cin >> n >> m;
    adj.assign(n, {});
    visited.assign(n, false);
    for (int i = 0; i < m; i++) {
        int a, b;
        cin >> a >> b;
        adj[a].push_back(b);
        adj[b].push_back(a);
    }
    int components = 0;
    for (int u = 0; u < n; u++) {
        if (!visited[u]) {
            components++;
            dfs(u);
        }
    }
    cout << components << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    static List<List<Integer>> adj = new ArrayList<>();
    static boolean[] visited;

    static void dfs(int u) {
        visited[u] = true;
        for (int v : adj.get(u))
            if (!visited[v]) dfs(v);
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), m = in.nextInt();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        visited = new boolean[n];
        for (int i = 0; i < m; i++) {
            int a = in.nextInt(), b = in.nextInt();
            adj.get(a).add(b);
            adj.get(b).add(a);
        }
        int components = 0;
        for (int u = 0; u < n; u++) {
            if (!visited[u]) {
                components++;
                dfs(u);
            }
        }
        System.out.println(components);
    }
}
`,
      python: `n, m = map(int, input().split())
adj = [[] for _ in range(n)]
for _ in range(m):
    a, b = map(int, input().split())
    adj[a].append(b)
    adj[b].append(a)
visited = [False] * n


def dfs(u):
    visited[u] = True
    for v in adj[u]:
        if not visited[v]:
            dfs(v)


components = 0
for u in range(n):
    if not visited[u]:
        components += 1
        dfs(u)
print(components)
`,
    },
  },
  {
    id: 'dijkstra',
    title: 'Dijkstra shortest paths',
    blurb:
      'A priority queue picks the closest node; distances shrink as edges relax.',
    category: 'graphs',
    visual: 'graph',
    input: '5 6\n0 1 4\n0 2 1\n2 1 2\n1 3 5\n2 3 8\n3 4 3\n',
    expected: '0 3 1 8 11\n',
    code: {
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), m = in.nextInt();
        List<List<int[]>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int i = 0; i < m; i++) {
            int a = in.nextInt(), b = in.nextInt(), w = in.nextInt();
            adj.get(a).add(new int[]{b, w});
            adj.get(b).add(new int[]{a, w});
        }

        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[0] = 0;
        PriorityQueue<int[]> pq = new PriorityQueue<>((x, y) -> x[0] - y[0]);
        pq.add(new int[]{0, 0});
        while (!pq.isEmpty()) {
            int[] top = pq.poll();
            int d = top[0], u = top[1];
            if (d > dist[u]) continue;
            for (int[] edge : adj.get(u)) {
                int v = edge[0], w = edge[1];
                if (d + w < dist[v]) {
                    dist[v] = d + w;
                    pq.add(new int[]{dist[v], v});
                }
            }
        }
        StringBuilder out = new StringBuilder();
        for (int x : dist) out.append(x).append(' ');
        System.out.println(out.toString().trim());
    }
}
`,
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<pair<int, int>>> adj(n);
    for (int i = 0; i < m; i++) {
        int a, b, w;
        cin >> a >> b >> w;
        adj[a].push_back({b, w});
        adj[b].push_back({a, w});
    }
    vector<int> dist(n, INT_MAX);
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;
    dist[0] = 0;
    pq.push({0, 0});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;
        for (auto [v, w] : adj[u]) {
            if (d + w < dist[v]) {
                dist[v] = d + w;
                pq.push({dist[v], v});
            }
        }
    }
    for (int i = 0; i < n; i++) cout << dist[i] << (i + 1 < n ? " " : "\\n");
}
`,
      python: `import heapq

n, m = map(int, input().split())
adj = [[] for _ in range(n)]
for _ in range(m):
    a, b, w = map(int, input().split())
    adj[a].append((b, w))
    adj[b].append((a, w))

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
print(*dist)
`,
    },
  },
  {
    id: 'grid-bfs',
    title: 'BFS on a grid',
    blurb:
      'Shortest path through a maze; the distance table fills like a wave.',
    category: 'graphs',
    visual: 'grid',
    input: '4 5\n..#..\n.#...\n...#.\n.#...\n',
    expected: '7\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, m;
    cin >> n >> m;
    vector<string> grid(n);
    for (auto& row : grid) cin >> row;

    vector<vector<int>> dist(n, vector<int>(m, -1));
    queue<pair<int, int>> q;
    dist[0][0] = 0;
    q.push({0, 0});
    int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};
    while (!q.empty()) {
        auto [r, c] = q.front();
        q.pop();
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nc < 0 || nr >= n || nc >= m) continue;
            if (grid[nr][nc] == '#' || dist[nr][nc] != -1) continue;
            dist[nr][nc] = dist[r][c] + 1;
            q.push({nr, nc});
        }
    }
    cout << dist[n - 1][m - 1] << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), m = in.nextInt();
        char[][] grid = new char[n][];
        for (int i = 0; i < n; i++) grid[i] = in.next().toCharArray();

        int[][] dist = new int[n][m];
        for (int[] row : dist) Arrays.fill(row, -1);
        Deque<int[]> q = new ArrayDeque<>();
        dist[0][0] = 0;
        q.add(new int[]{0, 0});
        int[] dr = {1, -1, 0, 0}, dc = {0, 0, 1, -1};
        while (!q.isEmpty()) {
            int[] cell = q.poll();
            int r = cell[0], c = cell[1];
            for (int d = 0; d < 4; d++) {
                int nr = r + dr[d], nc = c + dc[d];
                if (nr < 0 || nc < 0 || nr >= n || nc >= m) continue;
                if (grid[nr][nc] == '#' || dist[nr][nc] != -1) continue;
                dist[nr][nc] = dist[r][c] + 1;
                q.add(new int[]{nr, nc});
            }
        }
        System.out.println(dist[n - 1][m - 1]);
    }
}
`,
    },
  },
  {
    id: 'fibonacci',
    title: 'Recursion: Fibonacci',
    blurb: 'Watch the call tree grow, and every call return its value.',
    category: 'recursion',
    visual: 'calls',
    input: '5\n',
    expected: '5\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int fib(int n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

int main() {
    int n;
    cin >> n;
    cout << fib(n) << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    static int fib(int n) {
        if (n < 2) return n;
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        System.out.println(fib(n));
    }
}
`,
      python: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


n = int(input())
print(fib(n))
`,
    },
  },
  {
    id: 'permutations',
    title: 'Backtracking: permutations',
    blurb: 'Choose, recurse, un-choose: the path list grows and shrinks.',
    category: 'recursion',
    visual: 'calls',
    input: '3\n',
    expected: '1 2 3\n1 3 2\n2 1 3\n2 3 1\n3 1 2\n3 2 1\n',
    code: {
      python: `def backtrack(path, used, n):
    if len(path) == n:
        print(*path)
        return
    for x in range(1, n + 1):
        if not used[x]:
            used[x] = True
            path.append(x)
            backtrack(path, used, n)
            path.pop()
            used[x] = False


n = int(input())
backtrack([], [False] * (n + 1), n)
`,
      cpp: `#include <bits/stdc++.h>
using namespace std;

int n;
vector<int> path;
vector<bool> used;

void backtrack() {
    if ((int)path.size() == n) {
        for (int i = 0; i < n; i++) cout << path[i] << (i + 1 < n ? " " : "\\n");
        return;
    }
    for (int x = 1; x <= n; x++) {
        if (used[x]) continue;
        used[x] = true;
        path.push_back(x);
        backtrack();
        path.pop_back();
        used[x] = false;
    }
}

int main() {
    cin >> n;
    used.assign(n + 1, false);
    backtrack();
}
`,
    },
  },
  {
    id: 'coin-change',
    title: 'DP: coin change',
    blurb: 'Fewest coins for every amount, built from smaller answers.',
    category: 'recursion',
    visual: 'cells',
    input: '1 3 4\n6\n',
    expected: '2\n',
    code: {
      python: `coins = list(map(int, input().split()))
amount = int(input())

INF = float("inf")
dp = [0] + [INF] * amount
for x in range(1, amount + 1):
    for c in coins:
        if c <= x and dp[x - c] + 1 < dp[x]:
            dp[x] = dp[x - c] + 1
print(dp[amount] if dp[amount] != INF else -1)
`,
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> coins(3);
    for (auto& c : coins) cin >> c;
    int amount;
    cin >> amount;
    const int INF = 1e9;
    vector<int> dp(amount + 1, INF);
    dp[0] = 0;
    for (int x = 1; x <= amount; x++)
        for (int c : coins)
            if (c <= x && dp[x - c] + 1 < dp[x]) dp[x] = dp[x - c] + 1;
    cout << (dp[amount] == INF ? -1 : dp[amount]) << "\\n";
}
`,
    },
  },
  {
    id: 'grid-paths',
    title: 'DP on a grid',
    blurb:
      'Count paths in a grid; each cell adds the one above and the one left.',
    category: 'recursion',
    visual: 'grid',
    input: '4 5\n',
    expected: '35\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<long long>> ways(n, vector<long long>(m, 0));
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < m; j++) {
            if (i == 0 || j == 0) ways[i][j] = 1;
            else ways[i][j] = ways[i - 1][j] + ways[i][j - 1];
        }
    }
    cout << ways[n - 1][m - 1] << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), m = in.nextInt();
        long[][] ways = new long[n][m];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < m; j++) {
                if (i == 0 || j == 0) ways[i][j] = 1;
                else ways[i][j] = ways[i - 1][j] + ways[i][j - 1];
            }
        }
        System.out.println(ways[n - 1][m - 1]);
    }
}
`,
      python: `n, m = map(int, input().split())
ways = [[0] * m for _ in range(n)]
for i in range(n):
    for j in range(m):
        if i == 0 or j == 0:
            ways[i][j] = 1
        else:
            ways[i][j] = ways[i - 1][j] + ways[i][j - 1]
print(ways[n - 1][m - 1])
`,
    },
  },
  {
    id: 'cube-dp',
    title: '3D array',
    blurb: 'A 2×3×3 table filled layer by layer, drawn as a cube.',
    category: 'recursion',
    visual: 'cube',
    input: '',
    expected: '17\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int cube[2][3][3];
    for (int k = 0; k < 2; k++)
        for (int i = 0; i < 3; i++)
            for (int j = 0; j < 3; j++)
                cube[k][i][j] = 9 * k + 3 * i + j;
    cout << cube[1][2][2] << "\\n";
}
`,
      java: `public class Main {
    public static void main(String[] args) {
        int[][][] cube = new int[2][3][3];
        for (int k = 0; k < 2; k++)
            for (int i = 0; i < 3; i++)
                for (int j = 0; j < 3; j++)
                    cube[k][i][j] = 9 * k + 3 * i + j;
        System.out.println(cube[1][2][2]);
    }
}
`,
    },
  },
  {
    id: 'word-count',
    title: 'Hash map: word count',
    blurb: 'Count how often each word appears; entries appear and grow.',
    category: 'stacks',
    visual: 'map',
    input: 'the cat and the hat and the bat\n',
    expected: 'and 2\nbat 1\ncat 1\nhat 1\nthe 3\n',
    code: {
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        Map<String, Integer> count = new TreeMap<>();
        while (in.hasNext()) {
            String word = in.next();
            count.put(word, count.getOrDefault(word, 0) + 1);
        }
        for (Map.Entry<String, Integer> e : count.entrySet()) {
            System.out.println(e.getKey() + " " + e.getValue());
        }
    }
}
`,
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    map<string, int> count;
    string word;
    while (cin >> word) count[word]++;
    for (auto& [w, c] : count) cout << w << " " << c << "\\n";
}
`,
      python: `count = {}
for word in input().split():
    count[word] = count.get(word, 0) + 1
for word in sorted(count):
    print(word, count[word])
`,
    },
  },
  {
    id: 'bug-overflow',
    title: 'Sum that overflows',
    blurb: 'Three billion does not fit in an int. Where does it go wrong?',
    category: 'bugs',
    visual: 'bug',
    bug: true,
    input: '3\n1000000000 1000000000 1000000000\n',
    expected: '3000000000\n',
    code: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    int total = 0;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        total += x;
    }
    cout << total << "\\n";
}
`,
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        int total = 0;
        for (int i = 0; i < n; i++) total += in.nextInt();
        System.out.println(total);
    }
}
`,
    },
  },
  {
    id: 'bug-off-by-one',
    title: 'Off-by-one loop',
    blurb: 'The loop reads one element too many and crashes.',
    category: 'bugs',
    visual: 'bug',
    bug: true,
    input: '4\n3 8 1 6\n',
    expected: '8\n',
    code: {
      java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = in.nextInt();
        int best = a[0];
        for (int i = 1; i <= n; i++) {
            if (a[i] > best) best = a[i];
        }
        System.out.println(best);
    }
}
`,
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (auto& x : a) cin >> x;
    int best = a[0];
    for (int i = 1; i <= n; i++) {
        if (a.at(i) > best) best = a.at(i);
    }
    cout << best << "\\n";
}
`,
      python: `n = int(input())
a = list(map(int, input().split()))
best = a[0]
for i in range(1, n + 1):
    if a[i] > best:
        best = a[i]
print(best)
`,
    },
  },
  {
    id: 'bug-binary-search',
    title: 'Binary search that misses',
    blurb:
      'It prints -1 even though 7 is in the array. Step through to see why.',
    category: 'bugs',
    visual: 'bug',
    bug: true,
    input: '6 7\n1 3 5 7 9 11\n',
    expected: '3\n',
    code: {
      python: `n, x = map(int, input().split())
a = list(map(int, input().split()))

lo, hi = 0, n - 1
answer = -1
while lo < hi:
    mid = (lo + hi) // 2
    if a[mid] == x:
        answer = mid
        break
    if a[mid] < x:
        lo = mid + 1
    else:
        hi = mid - 1
print(answer)
`,
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, x;
    cin >> n >> x;
    vector<int> a(n);
    for (auto& v : a) cin >> v;
    int lo = 0, hi = n - 1, answer = -1;
    while (lo < hi) {
        int mid = (lo + hi) / 2;
        if (a[mid] == x) { answer = mid; break; }
        if (a[mid] < x) lo = mid + 1;
        else hi = mid - 1;
    }
    cout << answer << "\\n";
}
`,
    },
  },
]

export function exampleLanguages(
  program: ExampleProgram,
): VisualizerLanguage[] {
  return (['cpp', 'java', 'python'] as const).filter(
    (language) => program.code[language] !== undefined,
  )
}

export function exampleFor(
  program: ExampleProgram,
  language: VisualizerLanguage,
): VisualizerExample {
  const chosen =
    program.code[language] !== undefined
      ? language
      : (exampleLanguages(program)[0] ?? 'cpp')
  return {
    id: `${program.id}-${chosen}`,
    title: program.title,
    language: chosen,
    code: program.code[chosen] ?? '',
    input: program.input,
    expected: program.expected,
  }
}

// Every runnable example, flattened by language.
export const visualizerExamples: readonly VisualizerExample[] =
  examplePrograms.flatMap((program) =>
    exampleLanguages(program).map((language) => exampleFor(program, language)),
  )

export function defaultExample(
  language: VisualizerLanguage,
): VisualizerExample {
  const program = examplePrograms.find(
    (item) => item.code[language] !== undefined,
  )
  return exampleFor(program ?? examplePrograms[0], language)
}

export const edgeCaseIdeas = [
  'Smallest allowed input (n = 1)',
  'All values equal',
  'Already sorted and reverse sorted',
  'Duplicates and negative values',
  'Values near the limits (overflow)',
  'An empty or single-element answer',
] as const
