#include <bits/stdc++.h>
using namespace std;

// Reads everything up front, then delegates to a lookup pass.

vector<long long> slurp(int n) {
    vector<long long> out(n);
    for (int i = 0; i < n; i++) cin >> out[i];
    return out;
}

// ---- lifted from the original solution (this is the copied part) ----
pair<int,int> solve(const vector<long long>& a, long long t) {
    int n = (int)a.size();
    unordered_map<long long, int> seen;
    seen.reserve(n * 2);
    for (int idx = 1; idx <= n; idx++) {
        long long x = a[idx - 1];
        auto it = seen.find(t - x);
        if (it != seen.end()) {
            return {it->second, idx};
        }
        seen[x] = idx;
    }
    return {-1, -1};
}
// ---------------------------------------------------------------------

int main() {
    int n; long long target;
    if (!(cin >> n >> target)) return 1;
    vector<long long> numbers = slurp(n);
    pair<int,int> ans = solve(numbers, target);
    cout << ans.first << " " << ans.second << endl;
    return 0;
}
