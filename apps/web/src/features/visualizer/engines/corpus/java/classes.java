import java.util.*;

public class Main {
    static class Node {
        int val;
        Node next;
        Node(int val) { this.val = val; }
    }

    static class TreeNode {
        int key;
        TreeNode left, right;
        TreeNode(int key) { this.key = key; }
    }

    static TreeNode insert(TreeNode root, int key) {
        if (root == null) return new TreeNode(key);
        if (key < root.key) root.left = insert(root.left, key);
        else root.right = insert(root.right, key);
        return root;
    }

    static void inorder(TreeNode root, List<Integer> out) {
        if (root == null) return;
        inorder(root.left, out);
        out.add(root.key);
        inorder(root.right, out);
    }

    static int height(TreeNode root) {
        return root == null ? 0 : 1 + Math.max(height(root.left), height(root.right));
    }

    static Node reverse(Node head) {
        Node prev = null, cur = head;
        while (cur != null) {
            Node nxt = cur.next;
            cur.next = prev;
            prev = cur;
            cur = nxt;
        }
        return prev;
    }

    static class Point implements Comparable<Point> {
        final int x, y;
        Point(int x, int y) { this.x = x; this.y = y; }
        public int compareTo(Point o) { return x != o.x ? Integer.compare(x, o.x) : Integer.compare(y, o.y); }
        @Override public String toString() { return "(" + x + ", " + y + ")"; }
        @Override public boolean equals(Object o) {
            if (!(o instanceof Point)) return false;
            Point p = (Point) o;
            return x == p.x && y == p.y;
        }
        @Override public int hashCode() { return Objects.hash(x, y); }
    }

    interface Shape { double area(); }

    static class Circle implements Shape {
        double r;
        Circle(double r) { this.r = r; }
        public double area() { return Math.PI * r * r; }
    }

    static class Rect implements Shape {
        double w, h;
        Rect(double w, double h) { this.w = w; this.h = h; }
        public double area() { return w * h; }
    }

    static int counter = 0;

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        Node head = null, tail = null;
        TreeNode root = null;
        for (int i = 0; i < n; i++) {
            int v = in.nextInt();
            Node node = new Node(v);
            if (head == null) head = tail = node;
            else { tail.next = node; tail = node; }
            root = insert(root, v);
            counter++;
        }
        head = reverse(head);
        StringBuilder sb = new StringBuilder();
        for (Node p = head; p != null; p = p.next) sb.append(p.val).append(p.next != null ? " -> " : "");
        System.out.println(sb);
        List<Integer> sorted = new ArrayList<>();
        inorder(root, sorted);
        System.out.println(sorted + " height " + height(root) + " count " + counter);

        List<Point> pts = new ArrayList<>(List.of(new Point(3, 1), new Point(1, 5), new Point(3, 0)));
        Collections.sort(pts);
        System.out.println(pts);
        Set<Point> seen = new HashSet<>(pts);
        System.out.println(seen.contains(new Point(1, 5)) + " " + seen.size());
        List<Shape> shapes = new ArrayList<>();
        shapes.add(new Circle(1.5));
        shapes.add(new Rect(2, 3.5));
        double total = 0;
        for (Shape s : shapes) total += s.area();
        System.out.printf("total area %.4f%n", total);
        Node a = new Node(1), b = a;
        b.val = 99;
        System.out.println(a.val + " " + (a == b));
        String s1 = "abc", s2 = new String("abc");
        System.out.println(s1.equals(s2) + " " + s1.compareTo("abd"));
    }
}
