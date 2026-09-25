#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    int* a = new int[n];
    for (int i = 0; i < n; i++) a[i] = i * i;
    int* b = a;
    b[2] = 100;
    long long sum = 0;
    for (int i = 0; i < n; i++) sum += a[i];
    cout << sum << " " << *a << " " << *(a + 3) << "\n";
    int* box = new int(7);
    *box += 5;
    cout << *box << "\n";
    delete[] a;
    delete box;
}
