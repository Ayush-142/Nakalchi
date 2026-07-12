#include <bits/stdc++.h>
using namespace std;

// two-sum, hash map approach, O(n) expected

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    int total;          // element count
    long long goal;     // required sum
    cin >> total >> goal;

    unordered_map<long long, int> prior;    // value -> earliest index
    prior.reserve(2 * total);

    int pos = 1;
    while (pos <= total) {
        long long cur;
        cin >> cur;                          // next value
        long long complement = goal - cur;
        auto hit = prior.find(complement);
        if (prior.end() != hit) {
            // found the partner we stored earlier
            cout << hit->second << ' ' << pos << '\n';
            return 0;
        }
        prior[cur] = pos;                    // stash for later
        pos = pos + 1;
    }
    return 0;
}
