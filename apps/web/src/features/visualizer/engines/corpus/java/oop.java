import java.util.*;

public class Main {
    enum Color { RED, GREEN, BLUE }

    enum Planet {
        MERCURY(3.303e+23, 2.4397e6), EARTH(5.976e+24, 6.37814e6);
        private final double mass, radius;
        Planet(double mass, double radius) { this.mass = mass; this.radius = radius; }
        double gravity() { return 6.67300E-11 * mass / (radius * radius); }
    }

    record Pair(int first, String second) {}

    interface Animal {
        String sound();
        default String describe() { return getClass().getSimpleName() + " says " + sound(); }
    }

    static abstract class Base implements Animal {
        protected String name;
        static int created = 0;
        Base(String name) { this.name = name; created++; }
        abstract int legs();
        public String toString() { return name + "(" + legs() + " legs)"; }
    }

    static class Dog extends Base {
        Dog(String name) { super(name); }
        int legs() { return 4; }
        public String sound() { return "woof"; }
    }

    static class Bird extends Base {
        boolean flies;
        Bird(String name, boolean flies) { super(name); this.flies = flies; }
        int legs() { return 2; }
        public String sound() { return flies ? "tweet" : "squawk"; }
        @Override public String toString() { return "Bird:" + super.toString(); }
    }

    static class Box<T extends Comparable<T>> {
        private final List<T> items = new ArrayList<>();
        void add(T item) { items.add(item); }
        T max() {
            T best = items.get(0);
            for (T item : items) if (item.compareTo(best) > 0) best = item;
            return best;
        }
    }

    public static void main(String[] args) {
        Color c = Color.GREEN;
        System.out.println(c + " " + c.ordinal() + " " + Color.valueOf("BLUE").name() + " " + Color.values().length);
        switch (c) {
            case RED: System.out.println("stop"); break;
            case GREEN: System.out.println("go"); break;
            default: System.out.println("?");
        }
        for (Color each : Color.values()) System.out.print(each.name().toLowerCase() + " ");
        System.out.println();
        Map<Color, Integer> counts = new TreeMap<>();
        counts.put(Color.BLUE, 3);
        counts.put(Color.RED, 1);
        System.out.println(counts);
        for (Planet p : Planet.values()) System.out.printf("%s %.2f%n", p, p.gravity());

        Pair p1 = new Pair(1, "one"), p2 = new Pair(1, "one");
        System.out.println(p1 + " " + p1.equals(p2) + " " + (p1 == p2) + " " + p1.first() + p1.second());
        Set<Pair> pairs = new HashSet<>(List.of(p1, p2, new Pair(2, "two")));
        System.out.println(pairs.size());

        List<Animal> zoo = new ArrayList<>();
        zoo.add(new Dog("Rex"));
        zoo.add(new Bird("Tweety", true));
        zoo.add(new Bird("Pingu", false));
        for (Animal a : zoo) {
            System.out.println(a + " / " + a.describe());
            if (a instanceof Bird b && !b.flies) System.out.println(b.name + " cannot fly");
        }
        System.out.println("created " + Base.created);
        Object o = zoo.get(0);
        System.out.println((o instanceof Dog) + " " + (o instanceof Bird) + " " + (o instanceof Animal));

        Box<String> box = new Box<>();
        box.add("pear");
        box.add("apple");
        box.add("zucchini");
        System.out.println(box.max());
        Box<Integer> nums = new Box<>();
        for (int i : new int[]{4, 11, 7}) nums.add(i);
        System.out.println(nums.max());
    }
}
