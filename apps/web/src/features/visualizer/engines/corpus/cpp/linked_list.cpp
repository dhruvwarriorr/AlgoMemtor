#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode* next;
    ListNode(int v) : val(v), next(nullptr) {}
};

ListNode* reverseList(ListNode* head) {
    ListNode* prev = nullptr;
    ListNode* cur = head;
    while (cur != nullptr) {
        ListNode* nxt = cur->next;
        cur->next = prev;
        prev = cur;
        cur = nxt;
    }
    return prev;
}

int main() {
    int n;
    cin >> n;
    ListNode* head = nullptr;
    ListNode* tail = nullptr;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        ListNode* node = new ListNode(x);
        if (!head) head = tail = node;
        else {
            tail->next = node;
            tail = node;
        }
    }
    head = reverseList(head);
    for (ListNode* p = head; p; p = p->next) cout << p->val << (p->next ? " " : "\n");
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
    }
    cout << "middle " << slow->val << "\n";
    return 0;
}
