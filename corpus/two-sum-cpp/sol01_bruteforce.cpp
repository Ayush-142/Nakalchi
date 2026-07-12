#include <iostream>
#include <vector>
using namespace std;

int main() {
    int n; long long target;
    cin >> n >> target;
    vector<long long> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (a[i] + a[j] == target) {
                cout << i + 1 << " " << j + 1 << "\n";
                return 0;
            }
        }
    }
    return 0;
}
