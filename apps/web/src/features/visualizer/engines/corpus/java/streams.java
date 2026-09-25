import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> nums = Arrays.asList(5, 3, 8, 1, 9, 2);
        List<Integer> evens = nums.stream().filter(x -> x % 2 == 0).collect(Collectors.toList());
        System.out.println(evens);
        int sum = nums.stream().mapToInt(Integer::intValue).sum();
        System.out.println(sum + " " + nums.stream().mapToInt(x -> x).max().getAsInt());
        System.out.println(IntStream.rangeClosed(1, 5).map(x -> x * x).sum());
        String joined = nums.stream().sorted().map(String::valueOf).collect(Collectors.joining(","));
        System.out.println(joined);
        int[] arr = {4, 1, 3};
        System.out.println(Arrays.stream(arr).sum() + " " + Arrays.stream(arr).min().getAsInt());
        List<String> words = new ArrayList<>(List.of("delta", "alpha", "charlie", "bravo"));
        words.sort(Comparator.comparing(String::length).thenComparing(Comparator.reverseOrder()));
        System.out.println(words);
        words.removeIf(w -> w.startsWith("a"));
        System.out.println(words);
        Iterator<String> it = words.iterator();
        while (it.hasNext()) if (it.next().length() > 5) it.remove();
        System.out.println(words);
        Map<Integer, Integer> hm = new HashMap<>();
        for (int i = 20; i >= 0; i -= 3) hm.put(i, i * i);
        System.out.println(hm);
        Map<String, Integer> sm = new HashMap<>();
        for (String s : new String[]{"zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau"}) sm.merge(s, s.length(), Integer::sum);
        System.out.println(sm);
        Set<Character> cs = new HashSet<>();
        for (char ch : "mississippi".toCharArray()) cs.add(ch);
        System.out.println(cs);
        Map<Character, Integer> lhm = new LinkedHashMap<>();
        for (char ch : "banana".toCharArray()) lhm.put(ch, lhm.getOrDefault(ch, 0) + 1);
        System.out.println(lhm);
        List<List<Integer>> nested = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            nested.add(new ArrayList<>());
            for (int j = 0; j <= i; j++) nested.get(i).add(i * j);
        }
        System.out.println(nested);
        Runnable r = () -> System.out.println("run!");
        r.run();
        Comparator<int[]> byFirst = new Comparator<int[]>() {
            @Override
            public int compare(int[] a, int[] b) { return a[0] - b[0]; }
        };
        int[][] pts = {{3, 1}, {1, 2}, {2, 3}};
        Arrays.sort(pts, byFirst);
        System.out.println(Arrays.deepToString(pts));
        var total = 0L;
        for (var x : nums) total += x;
        System.out.println(total);
        long big = 1L << 40;
        System.out.println(big + " " + (big >>> 3) + " " + Long.bitCount(big - 1) + " " + (int) big);
        String sw = "b";
        switch (sw) {
            case "a" -> System.out.println("A");
            case "b" -> System.out.println("B");
            default -> System.out.println("other");
        }
        int k = 0;
        do { k += 3; } while (k < 10);
        System.out.println(k);
        Integer x1 = 1000, x2 = 1000;
        System.out.println(x1.equals(x2));
        char ch = 'a';
        ch += 2;
        ch++;
        System.out.println(ch);
        System.out.println(10 == 10.0);
        System.out.println((5 & 3) + " " + (5 | 3) + " " + (5 ^ 3) + " " + (~5));
        System.out.println(Integer.MIN_VALUE - 1);
        System.out.println(Math.floorMod(-7, 3) + " " + (-7 % 3) + " " + Math.floorDiv(-7, 2));
    }
}
