import { describe, expect, it } from 'vitest'

import { defaultTraceLimits, type ExecutionTrace } from '../../trace'
import { runJava } from './index'

function run(code: string, input = '', limits = defaultTraceLimits) {
  return runJava({ language: 'java', code, input, limits })
}

function program(body: string, extra = '') {
  return `import java.util.*;
public class Main {
${extra}
    public static void main(String[] args) {
${body}
    }
}`
}

function finished(trace: ExecutionTrace) {
  if (trace.status !== 'finished') {
    throw new Error(
      `${trace.error?.title}: ${trace.error?.message} (line ${trace.error?.line})`,
    )
  }
  return trace
}

function lastValue(trace: ExecutionTrace, name: string) {
  for (let i = trace.steps.length - 1; i >= 0; i -= 1) {
    const frames = trace.steps[i]?.frames ?? []
    for (let f = frames.length - 1; f >= 0; f -= 1) {
      const found = frames[f]?.vars.find(([key]) => key === name)
      if (found !== undefined) return trace.values[found[1]]
    }
  }
  return undefined
}

describe('Java engine', () => {
  it('reads input, loops and prints with Java formatting', () => {
    const trace = finished(
      run(
        program(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        long total = 0;
        for (int i = 0; i < n; i++) total += sc.nextInt();
        System.out.println("total " + total + " avg " + (double) total / n);`),
        '3\n1 2 4\n',
      ),
    )
    expect(trace.language).toBe('java')
    expect(trace.stdout).toBe('total 7 avg 2.3333333333333335\n')
    expect(trace.steps.some((step) => step.loop !== undefined)).toBe(true)
    const total = lastValue(trace, 'total')
    expect(total?.kind === 'number' ? total.text : '').toBe('7')
  })

  it('names the exception, line and index for an out-of-bounds access', () => {
    const trace = run(
      program(`        int[] a = new int[3];
        for (int i = 0; i <= 3; i++) a[i] = i;`),
    )
    expect(trace.status).toBe('error')
    expect(trace.error?.title).toBe('ArrayIndexOutOfBoundsException')
    expect(trace.error?.message).toBe('Index 3 out of bounds for length 3')
    expect(trace.error?.line).toBe(6)
  })

  it('explains a NullPointerException from unboxing a missing map value', () => {
    const trace = run(
      program(`        Map<String, Integer> m = new HashMap<>();
        int x = m.get("k");`),
    )
    expect(trace.error?.title).toBe('NullPointerException')
    expect(trace.error?.line).toBe(6)
    expect(trace.error?.details?.join(' ')).toContain('getOrDefault')
  })

  it('catches exceptions by their parent class and runs finally', () => {
    const trace = finished(
      run(
        program(`        try {
            Integer.parseInt("x1");
        } catch (IllegalArgumentException e) {
            System.out.println("caught " + e.getMessage());
        } finally {
            System.out.println("finally");
        }`),
      ),
    )
    expect(trace.stdout).toBe('caught For input string: "x1"\nfinally\n')
  })

  it('reports runaway recursion as a StackOverflowError', () => {
    const trace = run(
      program(
        '        System.out.println(f(1));',
        '    static int f(int n) { return f(n + 1) + 1; }',
      ),
    )
    expect(trace.error?.kind).toBe('recursion')
    expect(trace.error?.title).toBe('StackOverflowError')
  })

  it('keeps object identity for linked nodes and draws cycles as references', () => {
    const trace = finished(
      run(
        program(
          `        Node a = new Node(1);
        Node b = new Node(2);
        a.next = b;
        b.next = a;
        Node same = a;
        System.out.println(same.next.val + " " + (a == same));`,
          `    static class Node {
        int val;
        Node next;
        Node(int val) { this.val = val; }
    }`,
        ),
      ),
    )
    expect(trace.stdout).toBe('2 true\n')
    const a = lastValue(trace, 'a')
    const same = lastValue(trace, 'same')
    expect(a?.kind).toBe('record')
    expect(a?.kind === 'record' ? a.objectId : -1).toBe(
      same?.kind === 'record' ? same.objectId : -2,
    )
    expect(trace.values.some((value) => value.kind === 'ref')).toBe(true)
  })

  it('shares arrays and lists between variables like Java references', () => {
    const trace = finished(
      run(
        program(`        int[] a = {1, 2, 3};
        int[] b = a;
        b[0] = 9;
        List<Integer> x = new ArrayList<>();
        List<Integer> y = x;
        y.add(4);
        System.out.println(a[0] + " " + x);`),
      ),
    )
    expect(trace.stdout).toBe('9 [4]\n')
  })

  it('wraps int overflow like Java and notes it', () => {
    const trace = finished(
      run(
        program(`        int big = Integer.MAX_VALUE;
        big += 1;
        System.out.println(big);`),
      ),
    )
    expect(trace.stdout).toBe('-2147483648\n')
  })

  it('supports inheritance, interfaces, enums and records', () => {
    const trace = finished(
      run(
        program(
          `        Shape s = new Square(3);
        System.out.println(s.area() + " " + s.label() + " " + Level.HIGH.ordinal());
        System.out.println(new P(1, 2));`,
          `    enum Level { LOW, HIGH }
    record P(int x, int y) {}
    interface Shape { int area(); default String label() { return "shape"; } }
    static class Rect implements Shape {
        int w, h;
        Rect(int w, int h) { this.w = w; this.h = h; }
        public int area() { return w * h; }
    }
    static class Square extends Rect {
        Square(int side) { super(side, side); }
        public String label() { return "square of " + w; }
    }`,
        ),
      ),
    )
    expect(trace.stdout).toBe('9 square of 3 1\nP[x=1, y=2]\n')
  })

  it('loses PrintWriter output that is never flushed, and says so', () => {
    const trace = run(`import java.io.*;
public class Main {
    public static void main(String[] args) {
        PrintWriter out = new PrintWriter(System.out);
        out.println("hidden");
    }
}`)
    expect(trace.warnings.map((item) => item.message).join(' ')).toMatch(
      /flush/i,
    )
  })

  it('reports compile errors with a line number', () => {
    const trace = run(program('        int x = ;'))
    expect(trace.error?.kind).toBe('compile')
    expect(trace.error?.line).toBe(5)
  })

  it('requires a main method', () => {
    const trace = run('public class Main { static int f() { return 1; } }')
    expect(trace.error?.message).toMatch(/main/)
  })
})
