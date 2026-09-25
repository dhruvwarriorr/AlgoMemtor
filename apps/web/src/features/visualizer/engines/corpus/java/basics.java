import java.util.*;

public class Main {
    static int gcd(int a, int b) { return b == 0 ? a : gcd(b, a % b); }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] a = new int[n];
        long sum = 0;
        for (int i = 0; i < n; i++) {
            a[i] = sc.nextInt();
            sum += a[i];
        }
        System.out.println("sum = " + sum);
        int g = a[0];
        for (int x : a) g = gcd(g, x);
        System.out.println("gcd = " + g);
        Arrays.sort(a);
        System.out.println(Arrays.toString(a));
        int big = Integer.MAX_VALUE;
        big += 1;
        System.out.println("overflow: " + big);
        long wide = (long) Integer.MAX_VALUE + 1;
        System.out.println("long: " + wide);
        System.out.println(7 / 2 + " " + (-7 / 2) + " " + (-7 % 3) + " " + 7.0 / 2);
        System.out.println((char) ('a' + 2) + "" + 'x' + 1);
        System.out.println('a' + 1);
        double d = 10.0 / 3;
        System.out.printf("%.3f %d %s%n", d, n, "ok");
        System.out.println(String.format("%5d|%-5s|%05d", 42, "ab", 7));
        System.out.println(1.0 + " " + 100.0 / 3 + " " + 1e10 + " " + 0.1f);
        System.out.println(Math.max(3, 9) + " " + Math.abs(-4) + " " + Math.pow(2, 10));
        System.out.println(Integer.toBinaryString(10) + " " + Integer.bitCount(255) + " " + Long.MAX_VALUE);
        StringBuilder sb = new StringBuilder();
        for (int i = n - 1; i >= 0; i--) sb.append(a[i]).append(i > 0 ? "," : "");
        System.out.println(sb.reverse().toString());
        String s = "hello world";
        System.out.println(s.length() + " " + s.charAt(4) + " " + s.indexOf('o') + " " + s.substring(6).toUpperCase());
        String[] parts = "a,b,,c".split(",");
        System.out.println(parts.length + " " + String.join("|", parts));
        boolean flag = n > 3 && a[0] < a[n - 1];
        System.out.println(flag ? "yes" : "no");
        int x = 5;
        x <<= 2;
        x ^= 3;
        System.out.println(x + " " + (x >> 1) + " " + (-16 >>> 28));
        outer:
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                if (j == 2) continue outer;
                if (i == 2) break outer;
                System.out.print(i + "" + j + " ");
            }
        }
        System.out.println();
    }
}
