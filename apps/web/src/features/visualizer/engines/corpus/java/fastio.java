import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));
        int t = Integer.parseInt(br.readLine().trim());
        while (t-- > 0) {
            StringTokenizer st = new StringTokenizer(br.readLine());
            int n = Integer.parseInt(st.nextToken());
            long k = Long.parseLong(st.nextToken());
            long[] pre = new long[n + 1];
            st = new StringTokenizer(br.readLine());
            for (int i = 1; i <= n; i++) pre[i] = pre[i - 1] + Long.parseLong(st.nextToken());
            int best = 0;
            int left = 0;
            for (int right = 1; right <= n; right++) {
                while (pre[right] - pre[left] > k) left++;
                best = Math.max(best, right - left);
            }
            out.println(best);
        }
        out.flush();
    }
}
