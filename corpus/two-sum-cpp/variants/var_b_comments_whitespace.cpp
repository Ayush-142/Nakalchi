#include <bits/stdc++.h>
using namespace std;

// Solution to the two-sum problem
// Approach: single pass with a hash map
// Time complexity: O(n) average

int main()
{
    // fast input
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;              // number of elements
    long long t;        // the target sum
    cin >> n >> t;

    // maps value -> 1-based index where we saw it
    unordered_map<long long, int> seen;
    seen.reserve(n * 2);        // avoid rehashing

    for (int idx = 1; idx <= n; idx++)
    {
        long long x;
        cin >> x;   // read next number

        // did we already see the complement?
        auto it = seen.find(t - x);
        if (it != seen.end())
        {
            // yes -> print the pair and stop
            cout << it->second << ' ' << idx << '\n';
            return 0;
        }

        seen[x] = idx;  // remember this value
    }
    return 0;   // per the guarantee we never get here
}
