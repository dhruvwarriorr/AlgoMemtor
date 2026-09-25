import { describe, expect, it } from 'vitest'

import { defaultTraceLimits, type ExecutionTrace } from '../../trace'
import { runCpp } from './index'

function run(code: string, input = '', limits = defaultTraceLimits) {
  return runCpp({ language: 'cpp', code, input, limits })
}

function finished(trace: ExecutionTrace) {
  if (trace.status !== 'finished') {
    throw new Error(
      `${trace.error?.title}: ${trace.error?.message} (line ${trace.error?.line})`,
    )
  }
  return trace
}

function valueText(trace: ExecutionTrace, id: number): string {
  const value = trace.values[id]
  if (value === undefined) return '?'
  switch (value.kind) {
    case 'number':
      return value.text
    case 'bool':
      return String(value.value)
    case 'char':
      return `'${value.text}'`
    case 'string':
      return JSON.stringify(value.text)
    case 'sequence':
      return `[${value.items.map((item) => valueText(trace, item)).join(', ')}]`
    case 'mapping':
      return `{${value.entries.map(([k, v]) => `${valueText(trace, k)}: ${valueText(trace, v)}`).join(', ')}}`
    case 'record':
      return `(${value.fields.map(([, v]) => valueText(trace, v)).join(', ')})`
    case 'unset':
      return '?'
    default:
      return value.kind === 'none' ? value.text : value.text
  }
}

function lastVar(trace: ExecutionTrace, name: string): string | undefined {
  for (let i = trace.steps.length - 1; i >= 0; i -= 1) {
    const frames = trace.steps[i]?.frames ?? []
    for (let f = frames.length - 1; f >= 0; f -= 1) {
      const found = frames[f]?.vars.find(([key]) => key === name)
      if (found !== undefined) return valueText(trace, found[1])
    }
  }
  return undefined
}

describe('C++ engine', () => {
  it('runs a basic read, loop and print program with loop and branch steps', () => {
    const trace = finished(
      run(
        `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];
    int best = a[0];
    for (int i = 1; i < n; i++) {
        if (a[i] > best) best = a[i];
    }
    cout << best << endl;
    return 0;
}`,
        '5\n2 7 3 8 1\n',
      ),
    )
    expect(trace.stdout).toBe('8\n')
    expect(trace.steps.length).toBeGreaterThan(10)
    const loopSteps = trace.steps.filter((step) => step.loop?.line === 9)
    expect(loopSteps.map((step) => step.loop?.iteration)).toEqual([
      1, 2, 3, 4, 4,
    ])
    expect(loopSteps.at(-1)?.cond).toBe(false)
    const conditions = trace.steps
      .filter((step) => step.line === 10 && step.cond !== undefined)
      .map((step) => step.cond)
    expect(conditions).toEqual([true, false, true, false])
    expect(
      trace.steps.some((step) => step.reads?.some((read) => read.name === 'a')),
    ).toBe(true)
    expect(trace.branches.map((branch) => branch.kind)).toEqual([
      'for',
      'for',
      'if',
    ])
    expect(trace.indexHints.a).toContain('i')
    expect(lastVar(trace, 'a')).toBe('[2, 7, 3, 8, 1]')
    expect(trace.steps.at(-1)?.event).toBe('return')
  })

  it('reports signed overflow with the wrapped value', () => {
    const trace = finished(
      run(`#include <iostream>
int main() {
  int a = 2000000000;
  int b = a + a;
  long long c = 1LL * a * a;
  std::cout << b << " " << c << "\\n";
}`),
    )
    expect(trace.stdout).toBe('-294967296 4000000000000000000\n')
    expect(
      trace.warnings.some(
        (warning) =>
          warning.line === 4 && warning.message.includes('Signed overflow'),
      ),
    ).toBe(true)
  })

  it('stops at an out-of-range index and explains it', () => {
    const trace = run(`#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> a = {1, 2, 3, 4, 5};
  int s = 0;
  for (int i = 0; i <= 5; i++) s += a[i];
  cout << s;
}`)
    expect(trace.status).toBe('error')
    expect(trace.error?.title).toBe('Index out of range')
    expect(trace.error?.line).toBe(6)
    expect(trace.error?.details).toContain('Valid indexes: 0–4')
    expect(trace.error?.details).toContain('Access attempted: a[5]')
    expect(trace.steps.at(-1)?.event).toBe('error')
    expect(lastVar(trace, 's')).toBe('15')
  })

  it('traces recursion with call and return steps', () => {
    const trace = finished(
      run(`#include <bits/stdc++.h>
using namespace std;
long long fact(int n) {
  if (n <= 1) return 1;
  return n * fact(n - 1);
}
int main() { cout << fact(5) << '\\n'; }`),
    )
    expect(trace.stdout).toBe('120\n')
    const calls = trace.steps.filter((step) => step.event === 'call')
    expect(calls.length).toBe(6)
    const deepest = Math.max(...trace.steps.map((step) => step.frames.length))
    expect(deepest).toBe(6)
    const returns = trace.steps.filter(
      (step) => step.event === 'return' && step.value !== undefined,
    )
    expect(
      returns.map((step) => valueText(trace, step.value as number)).slice(0, 5),
    ).toEqual(['1', '2', '6', '24', '120'])
  })

  it('handles macros, long long redefinition and multiple test cases', () => {
    const trace = finished(
      run(
        `#include <bits/stdc++.h>
#define int long long
#define rep(i, a, b) for (int i = (a); i < (b); ++i)
#define all(x) (x).begin(), (x).end()
using namespace std;
void solve() {
  int n; cin >> n;
  vector<int> v(n);
  rep(i, 0, n) cin >> v[i];
  sort(all(v));
  int total = accumulate(all(v), 0LL);
  cout << v.back() << ' ' << total << '\\n';
}
signed main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  int t; cin >> t;
  while (t--) solve();
}`,
        '2\n3\n3000000000 1 2\n2\n5 4\n',
      ),
    )
    expect(trace.stdout).toBe('3000000000 3000000003\n5 9\n')
  })

  it('supports maps, sets, pairs, priority queues and lambdas', () => {
    const trace = finished(
      run(`#include <bits/stdc++.h>
using namespace std;
int main() {
  map<string, int> freq;
  for (string w : {"b", "a", "b"}) freq[w]++;
  for (auto& [word, count] : freq) cout << word << '=' << count << ' ';
  cout << '\\n';
  set<int> s = {5, 1, 3};
  s.insert(2);
  s.erase(5);
  cout << *s.begin() << ' ' << *prev(s.end()) << ' ' << s.size() << '\\n';
  vector<pair<int, int>> p = {{2, 1}, {1, 5}, {2, 0}};
  sort(p.begin(), p.end(), [](const pair<int, int>& x, const pair<int, int>& y) {
    if (x.first != y.first) return x.first > y.first;
    return x.second < y.second;
  });
  for (auto [a, b] : p) cout << a << ',' << b << ' ';
  cout << '\\n';
  priority_queue<int, vector<int>, greater<int>> pq;
  for (int x : {4, 1, 3}) pq.push(x);
  while (!pq.empty()) { cout << pq.top() << ' '; pq.pop(); }
  cout << '\\n';
  auto it = lower_bound(p.begin(), p.end(), make_pair(1, 5));
  cout << (it - p.begin()) << '\\n';
}`),
    )
    expect(trace.stdout).toBe('a=1 b=2 \n1 3 3\n2,0 2,1 1,5 \n1 3 4 \n0\n')
  })

  it('supports structs with operator< and member functions', () => {
    const trace = finished(
      run(`#include <bits/stdc++.h>
using namespace std;
struct Edge {
  int u, v, w;
  bool operator<(const Edge& other) const { return w < other.w; }
};
struct DSU {
  vector<int> p;
  DSU(int n) : p(n) { iota(p.begin(), p.end(), 0); }
  int find(int x) { return p[x] == x ? x : p[x] = find(p[x]); }
  bool unite(int a, int b) {
    a = find(a); b = find(b);
    if (a == b) return false;
    p[a] = b;
    return true;
  }
};
int main() {
  vector<Edge> edges = {{0, 1, 4}, {1, 2, 1}, {0, 2, 2}};
  sort(edges.begin(), edges.end());
  DSU d(3);
  int cost = 0;
  for (auto& e : edges) if (d.unite(e.u, e.v)) cost += e.w;
  cout << cost << endl;
}`),
    )
    expect(trace.stdout).toBe('3\n')
    expect(
      trace.steps.some((step) =>
        step.frames.some((frame) => frame.name === 'DSU.find'),
      ),
    ).toBe(true)
  })

  it('runs recursive lambdas and function objects', () => {
    const trace = finished(
      run(`#include <bits/stdc++.h>
using namespace std;
int main() {
  int n = 4;
  vector<vector<int>> g(n);
  auto add = [&](int a, int b) { g[a].push_back(b); g[b].push_back(a); };
  add(0, 1); add(1, 2); add(1, 3);
  vector<int> order;
  function<void(int, int)> dfs = [&](int u, int parent) {
    order.push_back(u);
    for (int v : g[u]) if (v != parent) dfs(v, u);
  };
  dfs(0, -1);
  for (int x : order) cout << x;
  cout << '\\n';
}`),
    )
    expect(trace.stdout).toBe('0123\n')
    expect(
      trace.steps.some((step) =>
        step.frames.some((frame) => frame.name === 'dfs'),
      ),
    ).toBe(true)
  })

  it('formats output like iostream and printf', () => {
    const trace = finished(
      run(
        `#include <bits/stdc++.h>
using namespace std;
int main() {
  double x = 3.14159265358979;
  cout << x << ' ' << 1.0 / 3 << ' ' << 1e20 << '\\n';
  cout << fixed << setprecision(3) << x << '\\n';
  printf("%d %5.2f %lld %s %c\\n", 42, 2.5, 10000000000LL, "hi", 'z');
  int a, b;
  scanf("%d %d", &a, &b);
  printf("%d\\n", a + b);
  string line;
  getline(cin, line);
  getline(cin, line);
  cout << line << '|' << endl;
}`,
        '3 4\nhello world\n',
      ),
    )
    expect(trace.stdout).toBe(
      '3.14159 0.333333 1e+20\n3.142\n42  2.50 10000000000 hi z\n7\nhello world|\n',
    )
  })

  it('reports compile errors with a line number', () => {
    const trace = run(`int main() {
  int x = 5
  return x;
}`)
    expect(trace.status).toBe('error')
    expect(trace.error?.kind).toBe('compile')
    expect(trace.error?.line).toBe(3)
    expect(trace.steps).toHaveLength(0)
  })

  it('rejects pointers clearly', () => {
    const trace = run(`struct Node { int v; Node* next; };
int main() {}`)
    expect(trace.error?.kind).toBe('unsupported')
    expect(trace.error?.message).toContain('Pointers')
  })

  it('stops infinite loops at the time limit and keeps the recorded steps', () => {
    const trace = run(`int main() { int x = 0; while (true) { x++; } }`, '', {
      ...defaultTraceLimits,
      timeMs: 200,
      maxSteps: 500,
    })
    expect(trace.status).toBe('error')
    expect(trace.error?.kind).toBe('timeout')
    expect(trace.truncated).toBe(true)
    expect(trace.steps.length).toBe(501)
    expect(trace.totalSteps).toBeGreaterThan(500)
  })

  it('warns about reading an unset variable', () => {
    const trace = finished(
      run(`#include <iostream>
int main() { int sum; for (int i = 0; i < 3; i++) sum += i; std::cout << sum; }`),
    )
    expect(trace.warnings[0]?.message).toContain(
      'sum is used before it is given a value',
    )
  })

  it('flags unsigned wrap-around from size() - 1 on an empty vector', () => {
    const trace = run(`#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> v;
  for (int i = 0; i < v.size() - 1; i++) cout << v[i];
}`)
    expect(
      trace.warnings.some((warning) =>
        warning.message.includes('Unsigned wrap-around'),
      ),
    ).toBe(true)
    expect(trace.status).toBe('error')
    expect(trace.error?.title).toBe('Index out of range')
  })

  it('shows only the used part of a large global array', () => {
    const trace = finished(
      run(
        `#include <bits/stdc++.h>
using namespace std;
const int N = 2e5 + 5;
int a[N];
long long dp[1005][1005];
int main() {
  int n; cin >> n;
  for (int i = 0; i < n; i++) cin >> a[i];
  dp[1][2] = 7;
  memset(a, 0, sizeof a);
  cout << dp[1][2] << ' ' << a[0] << ' ' << sizeof(a) / sizeof(a[0]) << '\\n';
}`,
        '3\n5 6 7\n',
      ),
    )
    expect(trace.stdout).toBe('7 0 200005\n')
    const arrayValue = trace.steps[
      trace.steps.length - 3
    ]?.frames[0]?.vars.find(([name]) => name === 'a')
    const value =
      arrayValue === undefined ? undefined : trace.values[arrayValue[1]]
    expect(value?.kind).toBe('sequence')
    if (value?.kind === 'sequence') {
      expect(value.length).toBe(200005)
      expect(value.items.length).toBeLessThanOrEqual(256)
    }
  })

  it('handles strings and characters', () => {
    const trace = finished(
      run(
        `#include <bits/stdc++.h>
using namespace std;
int main() {
  string s; cin >> s;
  int cnt[26] = {0};
  for (char c : s) cnt[c - 'a']++;
  string t = s;
  reverse(t.begin(), t.end());
  cout << (s == t ? "YES" : "NO") << ' ' << cnt[0] << ' ' << s.substr(1, 2) << ' ' << (char)toupper(s[0]) << ' ' << s.find("da") << '\\n';
  if (s.find("zz") == string::npos) cout << "none\\n";
  cout << to_string(12) + "x" << ' ' << stoi("-42") << '\\n';
}`,
        'abracadabra\n',
      ),
    )
    expect(trace.stdout).toBe('NO 5 br A 6\nnone\n12x -42\n')
  })

  it('treats input that ends early as a failed read', () => {
    const trace = finished(
      run(
        `#include <bits/stdc++.h>
using namespace std;
int main() { int x, total = 0; while (cin >> x) total += x; cout << total; }`,
        '1 2 3',
      ),
    )
    expect(trace.stdout).toBe('6')
    expect(trace.steps.at(-1)?.in).toBe(5)
  })
})
