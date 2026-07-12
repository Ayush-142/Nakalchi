#include <cstdio>
#include <cstdlib>

static long long *values;
static int count_n;

int readAll(long long *tgt) {
    if (scanf("%d %lld", &count_n, tgt) != 2) return 0;
    values = (long long *)malloc(sizeof(long long) * count_n);
    for (int k = 0; k < count_n; k++) scanf("%lld", &values[k]);
    return 1;
}

void findPair(long long tgt, int *outA, int *outB) {
    *outA = *outB = 0;
    for (int i = 0; i < count_n && !*outA; i++)
        for (int j = count_n - 1; j > i; j--)
            if (values[i] + values[j] == tgt) { *outA = i + 1; *outB = j + 1; break; }
}

int main(void) {
    long long target;
    int a, b;
    if (!readAll(&target)) return 1;
    findPair(target, &a, &b);
    printf("%d %d\n", a, b);
    free(values);
    return 0;
}
