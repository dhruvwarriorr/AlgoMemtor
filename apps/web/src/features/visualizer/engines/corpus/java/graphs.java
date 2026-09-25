import java.util.*;

public class Main {
    static List<List<Integer>> adj = new ArrayList<>();
    static boolean[] visited;
    static List<Integer> order = new ArrayList<>();

    static void dfs(int u) {
        visited[u] = true;
        order.add(u);
        for (int v : adj.get(u)) if (!visited[v]) dfs(v);
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), m = sc.nextInt();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        int[][] edges = new int[m][3];
        for (int i = 0; i < m; i++) {
            int u = sc.nextInt(), v = sc.nextInt(), w = sc.nextInt();
            adj.get(u).add(v);
            adj.get(v).add(u);
            edges[i] = new int[]{u, v, w};
        }
        visited = new boolean[n];
        dfs(0);
        System.out.println("dfs " + order);
        int[] dist = new int[n];
        Arrays.fill(dist, -1);
        Deque<Integer> queue = new ArrayDeque<>();
        queue.add(0);
        dist[0] = 0;
        while (!queue.isEmpty()) {
            int u = queue.poll();
            for (int v : adj.get(u)) {
                if (dist[v] == -1) {
                    dist[v] = dist[u] + 1;
                    queue.add(v);
                }
            }
        }
        System.out.println("bfs " + Arrays.toString(dist));
        List<List<int[]>> g = new ArrayList<>();
        for (int i = 0; i < n; i++) g.add(new ArrayList<>());
        for (int[] e : edges) {
            g.get(e[0]).add(new int[]{e[1], e[2]});
            g.get(e[1]).add(new int[]{e[0], e[2]});
        }
        long[] best = new long[n];
        Arrays.fill(best, Long.MAX_VALUE);
        best[0] = 0;
        PriorityQueue<long[]> pq = new PriorityQueue<>(Comparator.comparingLong(x -> x[0]));
        pq.add(new long[]{0, 0});
        while (!pq.isEmpty()) {
            long[] cur = pq.poll();
            int u = (int) cur[1];
            if (cur[0] > best[u]) continue;
            for (int[] e : g.get(u)) {
                if (best[u] + e[1] < best[e[0]]) {
                    best[e[0]] = best[u] + e[1];
                    pq.add(new long[]{best[e[0]], e[0]});
                }
            }
        }
        System.out.println("dijkstra " + Arrays.toString(best));
        int[][] grid = new int[3][4];
        for (int i = 0; i < 3; i++)
            for (int j = 0; j < 4; j++)
                grid[i][j] = (i == 0 || j == 0) ? 1 : grid[i - 1][j] + grid[i][j - 1];
        System.out.println(Arrays.deepToString(grid));
        long[] dp = new long[20];
        dp[0] = 1;
        dp[1] = 1;
        for (int i = 2; i < 20; i++) dp[i] = dp[i - 1] + dp[i - 2];
        System.out.println(dp[19]);
    }
}
