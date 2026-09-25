import java.util.*;

public class Main {
    static boolean isPalindrome(String s) {
        int i = 0, j = s.length() - 1;
        while (i < j) {
            if (s.charAt(i) != s.charAt(j)) return false;
            i++;
            j--;
        }
        return true;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        sc.nextLine();
        for (int k = 0; k < n; k++) {
            String line = sc.nextLine();
            int[] cnt = new int[26];
            for (char c : line.toCharArray()) {
                if (Character.isLetter(c)) cnt[Character.toLowerCase(c) - 'a']++;
            }
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 26; i++) if (cnt[i] > 0) sb.append((char) ('a' + i)).append(cnt[i]);
            String cleaned = line.replaceAll("[^A-Za-z]", "").toLowerCase();
            System.out.println(sb + " " + isPalindrome(cleaned) + " words=" + line.trim().split("\\s+").length);
        }
        char[] cs = "dcba".toCharArray();
        Arrays.sort(cs);
        System.out.println(new String(cs) + " " + String.valueOf(cs, 1, 2));
        String a = "abc";
        String b = a;
        a += "d";
        System.out.println(a + " " + b + " " + "x".repeat(3) + " " + "Hi".compareTo("Hello"));
        System.out.println(Character.isDigit('7') + " " + (int) 'A' + " " + (char) 66 + " " + Character.getNumericValue('9'));
        System.out.println(Integer.parseInt("-123") + Integer.valueOf(3) + " " + Double.parseDouble("2.5"));
        System.out.println("a-b-c".replace('-', '+') + " " + " pad ".trim() + "|" + "Hello".contains("ell"));
    }
}
