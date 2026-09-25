import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> list = new ArrayList<>();
        for (int i = 0; i < 6; i++) list.add(i * i % 7);
        System.out.println(list + " size=" + list.size());
        list.remove(Integer.valueOf(4));
        list.remove(0);
        System.out.println(list + " contains 2? " + list.contains(2));
        Collections.sort(list, Collections.reverseOrder());
        System.out.println(list);

        Map<String, Integer> freq = new HashMap<>();
        String[] words = {"apple", "banana", "apple", "cherry", "banana", "apple", "date"};
        for (String w : words) freq.put(w, freq.getOrDefault(w, 0) + 1);
        System.out.println(freq);
        for (Map.Entry<String, Integer> e : freq.entrySet()) {
            if (e.getValue() > 1) System.out.println(e.getKey() + " -> " + e.getValue());
        }
        TreeMap<Integer, String> tm = new TreeMap<>();
        tm.put(5, "five");
        tm.put(1, "one");
        tm.put(9, "nine");
        tm.put(3, "three");
        System.out.println(tm + " first=" + tm.firstKey() + " floor(4)=" + tm.floorKey(4) + " ceil(6)=" + tm.ceilingKey(6));

        Set<Integer> hs = new HashSet<>();
        for (int v : new int[]{50, 3, 17, 3, 100, 33, 16}) hs.add(v);
        System.out.println(hs + " " + hs.size());
        TreeSet<String> ts = new TreeSet<>(Arrays.asList("pear", "fig", "kiwi", "apple"));
        System.out.println(ts + " " + ts.first() + " " + ts.higher("fig"));

        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(1);
        stack.push(2);
        stack.push(3);
        System.out.println(stack.peek() + " " + stack.pop() + " " + stack);
        Queue<Integer> q = new LinkedList<>();
        q.offer(10);
        q.offer(20);
        q.add(30);
        System.out.println(q.poll() + " " + q.peek() + " " + q);

        PriorityQueue<Integer> pq = new PriorityQueue<>();
        for (int v : new int[]{5, 1, 8, 3, 9, 2}) pq.add(v);
        System.out.println(pq);
        StringBuilder order = new StringBuilder();
        while (!pq.isEmpty()) order.append(pq.poll()).append(' ');
        System.out.println(order.toString().trim());
        PriorityQueue<int[]> maxPq = new PriorityQueue<>((x, y) -> y[1] - x[1]);
        maxPq.add(new int[]{1, 40});
        maxPq.add(new int[]{2, 90});
        maxPq.add(new int[]{3, 60});
        int[] top = maxPq.poll();
        System.out.println(top[0] + ":" + top[1] + " next " + maxPq.peek()[0]);

        Stack<Character> st = new Stack<>();
        String br = "{[()]}(";
        for (char c : br.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') st.push(c);
            else if (!st.isEmpty()) st.pop();
        }
        System.out.println("left open: " + st);

        List<int[]> pairs = new ArrayList<>();
        pairs.add(new int[]{3, 1});
        pairs.add(new int[]{1, 2});
        pairs.add(new int[]{3, 0});
        pairs.sort((p1, p2) -> p1[0] != p2[0] ? Integer.compare(p1[0], p2[0]) : p1[1] - p2[1]);
        for (int[] p : pairs) System.out.print("(" + p[0] + "," + p[1] + ")");
        System.out.println();
        Map<Integer, List<Integer>> groups = new TreeMap<>();
        for (int i = 0; i < 7; i++) groups.computeIfAbsent(i % 3, k -> new ArrayList<>()).add(i);
        System.out.println(groups);
        Integer boxedA = 127, boxedB = 127;
        System.out.println(boxedA.equals(boxedB) + " " + (boxedA == boxedB));
    }
}
