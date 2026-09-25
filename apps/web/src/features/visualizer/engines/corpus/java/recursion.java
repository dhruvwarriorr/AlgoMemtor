import java.util.*;

public class Main {
    static long[] memo = new long[60];

    static long fib(int n) {
        if (n < 2) return n;
        if (memo[n] != 0) return memo[n];
        return memo[n] = fib(n - 1) + fib(n - 2);
    }

    static void permute(int[] a, int k, List<String> out) {
        if (k == a.length) {
            out.add(Arrays.toString(a));
            return;
        }
        for (int i = k; i < a.length; i++) {
            int t = a[k]; a[k] = a[i]; a[i] = t;
            permute(a, k + 1, out);
            t = a[k]; a[k] = a[i]; a[i] = t;
        }
    }

    static int[] parent;

    static int find(int x) { return parent[x] == x ? x : (parent[x] = find(parent[x])); }

    static void mergeSort(int[] a, int lo, int hi, int[] tmp) {
        if (hi - lo <= 1) return;
        int mid = (lo + hi) / 2;
        mergeSort(a, lo, mid, tmp);
        mergeSort(a, mid, hi, tmp);
        int i = lo, j = mid, k = lo;
        while (i < mid && j < hi) tmp[k++] = a[i] <= a[j] ? a[i++] : a[j++];
        while (i < mid) tmp[k++] = a[i++];
        while (j < hi) tmp[k++] = a[j++];
        for (k = lo; k < hi; k++) a[k] = tmp[k];
    }

    static int binarySearch(int[] a, int target) {
        int lo = 0, hi = a.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] == target) return mid;
            else if (a[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -(lo + 1);
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(fib(n) + " " + fib(50));
        List<String> perms = new ArrayList<>();
        permute(new int[]{1, 2, 3}, 0, perms);
        System.out.println(perms);
        parent = new int[8];
        for (int i = 0; i < 8; i++) parent[i] = i;
        int[][] unions = {{0, 1}, {2, 3}, {1, 3}, {5, 6}};
        for (int[] u : unions) parent[find(u[0])] = find(u[1]);
        Set<Integer> roots = new TreeSet<>();
        for (int i = 0; i < 8; i++) roots.add(find(i));
        System.out.println("components " + roots.size() + " " + Arrays.toString(parent));
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextInt();
        mergeSort(a, 0, n, new int[n]);
        System.out.println(Arrays.toString(a) + " idx " + binarySearch(a, 7) + " " + binarySearch(a, 4));
        int W = 10;
        int[] wt = {5, 4, 6, 3}, val = {10, 40, 30, 50};
        int[][] dp = new int[wt.length + 1][W + 1];
        for (int i = 1; i <= wt.length; i++)
            for (int w = 0; w <= W; w++) {
                dp[i][w] = dp[i - 1][w];
                if (wt[i - 1] <= w) dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - wt[i - 1]] + val[i - 1]);
            }
        System.out.println("knapsack " + dp[wt.length][W]);
        String s1 = "kitten", s2 = "sitting";
        int[][] ed = new int[s1.length() + 1][s2.length() + 1];
        for (int i = 0; i <= s1.length(); i++) ed[i][0] = i;
        for (int j = 0; j <= s2.length(); j++) ed[0][j] = j;
        for (int i = 1; i <= s1.length(); i++)
            for (int j = 1; j <= s2.length(); j++)
                ed[i][j] = s1.charAt(i - 1) == s2.charAt(j - 1) ? ed[i - 1][j - 1]
                        : 1 + Math.min(ed[i - 1][j - 1], Math.min(ed[i - 1][j], ed[i][j - 1]));
        System.out.println("edit " + ed[s1.length()][s2.length()]);
    }
}
