import type { VisualizerLanguage } from './trace'

export type VisualizerExample = {
  id: string
  title: string
  language: VisualizerLanguage
  code: string
  input: string
  expected: string
}

export const visualizerExamples: readonly VisualizerExample[] = [
  {
    id: 'cpp-two-pointers',
    title: 'Two pointers: pair with a given sum',
    language: 'cpp',
    code: `#include <bits/stdc++.h>
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
    return 0;
}
`,
    input: '6 13\n1 3 4 6 9 11\n',
    expected: '2 4\n',
  },
  {
    id: 'cpp-binary-search',
    title: 'Binary search: first element ≥ x',
    language: 'cpp',
    code: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, x;
    cin >> n >> x;
    vector<int> a(n);
    for (auto& v : a) cin >> v;

    int lo = 0, hi = n;  // answer is in [lo, hi]
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] >= x) hi = mid;
        else lo = mid + 1;
    }
    cout << lo << "\\n";
}
`,
    input: '8 7\n1 2 4 4 7 7 9 12\n',
    expected: '4\n',
  },
  {
    id: 'cpp-grid-bfs',
    title: 'BFS on a grid',
    language: 'cpp',
    code: `#include <bits/stdc++.h>
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
    input: '3 4\n..#.\n.#..\n....\n',
    expected: '5\n',
  },
  {
    id: 'cpp-overflow',
    title: 'Find the bug: sum that overflows',
    language: 'cpp',
    code: `#include <bits/stdc++.h>
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
    input: '3\n1000000000 1000000000 1000000000\n',
    expected: '3000000000\n',
  },
  {
    id: 'python-two-pointers',
    title: 'Two pointers: pair with a given sum',
    language: 'python',
    code: `n, target = map(int, input().split())
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
    input: '6 13\n1 3 4 6 9 11\n',
    expected: '2 4\n',
  },
  {
    id: 'python-recursion',
    title: 'Recursion: merge sort',
    language: 'python',
    code: `def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left = merge_sort(a[:mid])
    right = merge_sort(a[mid:])
    merged = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            merged.append(right[j])
            j += 1
    merged.extend(left[i:])
    merged.extend(right[j:])
    return merged

nums = list(map(int, input().split()))
print(*merge_sort(nums))
`,
    input: '5 2 9 1 7\n',
    expected: '1 2 5 7 9\n',
  },
  {
    id: 'python-dp',
    title: 'DP: coin change',
    language: 'python',
    code: `coins = list(map(int, input().split()))
amount = int(input())

INF = float('inf')
dp = [0] + [INF] * amount
for x in range(1, amount + 1):
    for c in coins:
        if c <= x and dp[x - c] + 1 < dp[x]:
            dp[x] = dp[x - c] + 1
print(dp[amount] if dp[amount] != INF else -1)
`,
    input: '1 3 4\n6\n',
    expected: '2\n',
  },
]

export function defaultExample(
  language: VisualizerLanguage,
): VisualizerExample {
  return visualizerExamples.find(
    (example) => example.language === language,
  ) as VisualizerExample
}

export const edgeCaseIdeas = [
  'Smallest allowed input (n = 1)',
  'All values equal',
  'Already sorted and reverse sorted',
  'Duplicates and negative values',
  'Values near the limits (overflow)',
  'An empty or single-element answer',
] as const
