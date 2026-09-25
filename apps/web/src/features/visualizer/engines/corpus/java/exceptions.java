public class Main {
    static int parse(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            System.out.println("bad number: " + e.getMessage());
            return -1;
        } finally {
            System.out.println("parsed " + s);
        }
    }

    static int depth(int n) {
        if (n == 0) throw new IllegalStateException("bottom reached");
        return depth(n - 1) + 1;
    }

    public static void main(String[] args) {
        System.out.println(parse("42") + parse("4x2"));
        try {
            depth(5);
        } catch (IllegalStateException e) {
            System.out.println("caught " + e.getMessage());
        }
        int[] arr = new int[3];
        try {
            arr[3] = 1;
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println(e.getMessage());
        }
        try {
            int z = 0;
            System.out.println(10 / z);
        } catch (ArithmeticException e) {
            System.out.println("arith: " + e.getMessage());
        }
        String t = null;
        try {
            System.out.println(t.length());
        } catch (NullPointerException e) {
            System.out.println("npe caught");
        }
        try {
            throw new RuntimeException("custom");
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }
        System.out.println("done");
    }
}
