#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

struct Entry { long long val; int orig; };

bool byVal(const Entry &a, const Entry &b) { return a.val < b.val; }

int main() {
    int n; long long target;
    cin >> n >> target;
    vector<Entry> e(n);
    for (int i = 0; i < n; i++) { cin >> e[i].val; e[i].orig = i + 1; }
    sort(e.begin(), e.end(), byVal);
    for (int i = 0; i < n; i++) {
        long long want = target - e[i].val;
        // binary search for `want` strictly to the right of i
        int lo = i + 1, hi = n - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (e[mid].val == want) {
                int p = e[i].orig, q = e[mid].orig;
                if (p > q) swap(p, q);
                cout << p << " " << q << "\n";
                return 0;
            } else if (e[mid].val < want) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return 0;
}
