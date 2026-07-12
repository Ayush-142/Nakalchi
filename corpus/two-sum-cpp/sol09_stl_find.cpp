#include <algorithm>
#include <iostream>
#include <iterator>
#include <vector>
using namespace std;

int main() {
    int n;
    long long target;
    cin >> n >> target;
    vector<long long> data;
    data.reserve(n);
    copy_n(istream_iterator<long long>(cin), n, back_inserter(data));

    for (auto it = data.begin(); it != data.end(); ++it) {
        auto match = find(next(it), data.end(), target - *it);
        if (match != data.end()) {
            cout << (it - data.begin() + 1) << " "
                 << (match - data.begin() + 1) << "\n";
            break;
        }
    }
    return 0;
}
