#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);
    int cnt; long long goal;
    cin >> cnt >> goal;
    unordered_map<long long, int> encountered;
    encountered.reserve(cnt * 2);
    for (int cursor = 1; cursor <= cnt; cursor++) {
        long long val;
        cin >> val;
        auto found = encountered.find(goal - val);
        if (found != encountered.end()) {
            cout << found->second << ' ' << cursor << '\n';
            return 0;
        }
        encountered[val] = cursor;
    }
    return 0;
}
