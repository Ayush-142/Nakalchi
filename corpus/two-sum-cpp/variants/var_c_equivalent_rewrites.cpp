#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);
    int n; long long t;
    cin >> n >> t;
    unordered_map<long long, int> seen;
    seen.reserve(2 * n);
    int idx = 1;
    while (idx <= n) {
        long long x;
        cin >> x;
        long long need = t - x;
        auto it = seen.find(need);
        if (seen.end() != it) {
            cout << it->second << ' ' << idx << '\n';
            return 0;
        }
        seen[x] = idx;
        idx = idx + 1;
    }
    return 0;
}
