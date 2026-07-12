#include <iostream>
#include <set>
#include <vector>
using namespace std;

int main() {
    int n; long long target;
    cin >> n >> target;
    vector<long long> arr(n);
    multiset<long long> pool;
    for (int i = 0; i < n; i++) {
        cin >> arr[i];
        pool.insert(arr[i]);
    }
    for (int i = 0; i < n; i++) {
        // remove current element so we don't pair it with itself
        pool.erase(pool.find(arr[i]));
        if (pool.count(target - arr[i])) {
            // second index = first later occurrence of the complement
            for (int j = i + 1; j < n; j++) {
                if (arr[j] == target - arr[i]) {
                    cout << i + 1 << " " << j + 1 << "\n";
                    return 0;
                }
            }
        }
    }
    return 0;
}
