#include <iostream>
#include <unordered_map>
#include <vector>

int main() {
    int n;
    long long target;
    std::cin >> n >> target;
    std::vector<long long> nums(n);
    std::unordered_map<long long, int> lastPos;
    for (int i = 0; i < n; ++i) {
        std::cin >> nums[i];
        lastPos[nums[i]] = i;   // keep the rightmost position
    }
    for (int i = 0; i < n; ++i) {
        long long need = target - nums[i];
        auto hit = lastPos.find(need);
        if (hit != lastPos.end() && hit->second != i) {
            int j = hit->second;
            if (i > j) std::swap(i, j);
            std::cout << i + 1 << " " << j + 1 << std::endl;
            break;
        }
    }
    return 0;
}
