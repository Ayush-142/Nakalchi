#include <bits/stdc++.h>

int main() {
    using namespace std;
    int n; long long target;
    cin >> n >> target;
    vector<long long> a(n);
    for (auto &v : a) cin >> v;

    // sort an index array instead of the values themselves
    vector<int> ord(n);
    iota(ord.begin(), ord.end(), 0);
    sort(ord.begin(), ord.end(), [&](int p, int q) { return a[p] < a[q]; });

    int l = 0, r = n - 1;
    while (l < r) {
        long long sum = a[ord[l]] + a[ord[r]];
        if (sum == target) break;
        (sum < target) ? ++l : --r;
    }
    int i = ord[l] + 1, j = ord[r] + 1;
    cout << min(i, j) << ' ' << max(i, j) << endl;
}
