#include <bits/stdc++.h>
using namespace std;

int main() {
    int n; long long t;
    unordered_map<long long, int> seen;
    cin.tie(nullptr);
    ios_base::sync_with_stdio(false);
    cin >> n >> t;
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
