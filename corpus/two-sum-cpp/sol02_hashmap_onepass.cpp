#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);
    int n; long long t;
    cin >> n >> t;
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
    return 0;
}
