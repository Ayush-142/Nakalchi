#include <iostream>
#include <map>

int main() {
    std::ios::sync_with_stdio(false);
    int n;
    long long target, x;
    std::cin >> n >> target;
    std::map<long long, int> firstIndex;
    int answerA = -1, answerB = -1;
    for (int pos = 1; pos <= n; ++pos) {
        std::cin >> x;
        if (answerA == -1) {
            std::map<long long, int>::iterator w = firstIndex.find(target - x);
            if (w != firstIndex.end()) {
                answerA = w->second;
                answerB = pos;
            } else if (firstIndex.count(x) == 0) {
                firstIndex[x] = pos;
            }
        }
    }
    std::cout << answerA << " " << answerB << "\n";
    return 0;
}
