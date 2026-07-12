#include <bits/stdc++.h>
using namespace std;

static unordered_map<long long, int> seen;

void setupIO() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);
}

bool step(long long t, int idx) {
    long long x;
    cin >> x;
    auto it = seen.find(t - x);
    if (it != seen.end()) {
        cout << it->second << ' ' << idx << '\n';
        return true;
    }
    seen[x] = idx;
    return false;
}

int main() {
    setupIO();
    int n; long long t;
    cin >> n >> t;
    seen.reserve(n * 2);
    for (int idx = 1; idx <= n; idx++)
        if (step(t, idx)) return 0;
    return 0;
}
