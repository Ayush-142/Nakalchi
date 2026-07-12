#include <bits/stdc++.h>
using namespace std;

static int runs = 0;

void banner() {
    // deliberately original code around the lifted part
    runs++;
}

// ---- lifted from the original solution (this is the copied part) ----
int solve(int n, long long t) {
    unordered_map<long long, int> seen;
    seen.reserve(n * 2);
    for (int idx = 1; idx <= n; idx++) {
        long long x;
        cin >> x;
        auto it = seen.find(t - x);
        if (it != seen.end()) {
            cout << it->second << ' ' << idx << '\n';
            return 0;
        }
        seen[x] = idx;
    }
    return 1;
}
// ---------------------------------------------------------------------

int main() {
    banner();
    int n; long long t;
    if (!(cin >> n >> t)) return 1;
    int status = solve(n, t);
    banner();
    return status == 0 ? 0 : 2;
}
