#include <bits/stdc++.h>
using namespace std;
typedef pair<long long,int> pli;

int main(){
    int n; long long target; scanf("%d %lld",&n,&target);
    vector<pli> v(n);
    for(int i=0;i<n;i++){ scanf("%lld",&v[i].first); v[i].second=i+1; }
    sort(v.begin(),v.end());
    int lo=0, hi=n-1;
    while(lo<hi){
        long long s=v[lo].first+v[hi].first;
        if(s==target){
            int a=v[lo].second,b=v[hi].second;
            printf("%d %d\n",min(a,b),max(a,b));
            return 0;
        }
        if(s<target) lo++; else hi--;
    }
    return 0;
}
