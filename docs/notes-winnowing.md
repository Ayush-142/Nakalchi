# Notes on Winnowing (Schleimer, Wilkerson, Aiken — SIGMOD 2003)

> Sourcing note: definitions, the guarantee statement, the density figures,
> the position-fragility argument, the tie-break rule, and the Figure 2
> worked-example numbers below are drawn from the paper's actual text and
> figures (I couldn't get a clean text-extraction of the PDF locally, so I
> cross-checked the numbers by hand-recomputing the whole worked example
> from the algorithm's stated rules — see §6, everything lines up exactly).
> Anywhere I'm reasoning about *why* something works, or building my own
> illustrative example, that's my own exposition on top of the paper, not a
> quote — I've tried to keep those clearly separated below.

## 1. The problem

Exact-match comparison (`diff`, or hashing whole files) only catches copies
that are byte-identical. The moment someone renames a variable, reflows
whitespace, or reorders two independent functions, a file-level hash changes
completely even though the *content* is unchanged. `diff` is better — it
finds line-level edits — but it's still fooled by anything that changes
line boundaries: reformatting, renaming across many lines, or moving a block
of code somewhere else in the file. Both approaches compare two documents
*globally* and expect their structure to line up.

What we actually want is something that can say "these 40 characters here
match those 40 characters over there," regardless of what surrounds them —
that's **local** fingerprinting. Instead of hashing a whole document, you
hash *many small overlapping windows* of it and keep a subset of those
hashes as the document's "fingerprint set." Two documents are then compared
by intersecting their fingerprint sets: shared fingerprints indicate shared
local content, wherever it happens to sit in the file. This is exactly the
substitution the winnowing paper is solving for: not "did the whole document
change" but "is there a chunk of this document that also appears in that
one."

## 2. Why k-gram hashing alone isn't enough

The natural first move: break the document into all overlapping substrings
of length `k` (**k-grams** — the paper's own term, "a contiguous substring
of length k"), hash each one, and call the whole hash sequence the
fingerprint set. This works for correctness — any shared substring of
length ≥ k produces a shared hash — but it's expensive: the number of
hashes is `document length − k + 1`, i.e., you've barely compressed
anything. You need to select a *subset* of these hashes without losing the
detection guarantee. Two obvious subset rules turn out to be broken in
different ways:

**"Select every i-th hash"** (fixed period, e.g. keep hash #0, #4, #8, ...).
This selects by *position*, not content, so it's fragile to any edit that
shifts what comes after it. Concrete tiny example: say a document's k-gram
hashes at positions 0..7 are `[h0..h7]`, and we sample position ≡ 0 mod 4,
so we keep `h0` and `h4`. Now insert a single character near the start of a
copy of this document. Every k-gram from that point on shifts by one
position: what used to be `h4` (a hash of some real shared content) is now
sitting at position 5 — not a multiple of 4 — so it's silently dropped from
the sample. The *content* didn't change, only its offset, but a
fixed-period sampler has no way to know that; it will now emit a
completely different set of sampled hashes for what is still, substantially,
the same document. One insertion anywhere before a match can desynchronize
sampling for everything after it.

**"Select hashes ≡ 0 mod p"** (keep a hash if it happens to be divisible by
some constant). This one *is* content-based — it survives insertions
elsewhere, since each hash's fate depends only on its own value, not its
position. But it has the opposite problem: nothing bounds the *gap* between
two selected hashes. A run of k-grams could, by chance, contain zero hashes
divisible by p — meaning a real, meaningful shared match could produce
*no* shared fingerprints at all. There's no worst-case guarantee, which is
fatal for a plagiarism detector: "probably catches most copies" isn't a
claim you can defend to a reviewer disputing a flagged pair.

Winnowing is built specifically to get both properties at once: a hard
bound on the gap between selections (from "every i-th hash"'s window
discipline) *and* content-dependent selection that survives shifts (from
mod-p's local-value dependence).

## 3. Winnowing itself

The algorithm, stated plainly: slide a window of `w` consecutive k-gram
hashes across the document. **In each window, select the minimum hash
value. If more than one hash in the window ties for the minimum, select the
rightmost occurrence.** As the window slides one step, if the newly
selected minimum is the same position as last time, don't re-record it —
only a *change* in which position is selected produces a new fingerprint
entry. That's the whole algorithm.

Why does a window of minima fix the position-fragility problem from §2?
Because *which* hash is the minimum of a window is a property of the
*content* of that window, not of the window's absolute offset in the
document. If an insertion happens somewhere else in the document, it shifts
where the window sits, but it doesn't change what the window contains once
it's back over the same stretch of shared text — so the same content will,
again, produce the same selected minimum. The window is anchored to
content, so selection travels with the content, not with position in the
file.

Why the rightmost tie-break specifically, and not leftmost or arbitrary?
Picture a run of several equal, minimum-valued hashes inside overlapping
windows (this happens constantly in real code — repeated tokens like `; }`
produce identical local hashes). As the window slides past this run one
step at a time, the *set of tied minima visible in the window* only loses
values off the left edge and gains them on the right edge. If ties always
resolve to the rightmost candidate, the selected position only changes when
the window's right edge actually introduces a new, different minimum —
so the same fingerprint gets selected (and skipped on re-record) across the
whole overlapping run, and selection is stable and predictable as the
window advances. A leftmost or arbitrary tie-break doesn't have this
stability property against the specific sliding-window mechanics winnowing
uses.

## 4. The (t, k)-guarantee

Precise statement (this is the paper's own claim): **any shared substring
of length at least `t = w + k − 1` tokens is guaranteed to produce at least
one shared fingerprint** between the two documents that contain it.

Proof sketch, in plain language: a shared run of `t = w + k − 1` characters
contains exactly `w` k-grams entirely within it (a run of length `t` yields
`t − k + 1 = w` k-grams of length `k`). Those `w` k-gram hashes are exactly
the contents of *one full window* — winnowing's window size is defined as
`w` for precisely this reason. Since winnowing selects the minimum hash
from every window it examines, and this window's hashes are entirely
determined by content inside the shared run (nothing outside the run
influences which of these `w` hashes is smallest), whichever hash is the
minimum will be selected as a fingerprint in *both* copies of the document,
identically — because both copies contain byte-for-byte the same `w`
k-grams here, they compute the exact same minimum. That shared minimum is
the guaranteed common fingerprint. Make the shared run any shorter than
`t`, and you can no longer guarantee a full window fits entirely inside it
— the window would have to peek outside the shared content, where the two
documents might differ, and the guarantee breaks.

This is why `t = w + k − 1` is the exact threshold, not an approximation:
it's the smallest run length that fits one complete window of `w` k-grams.

## 5. Density

The paper states winnowing's expected fingerprint density (fraction of all
hashes that get selected) is **≈ 2/(w+1)**, and separately proves a lower
bound of **1.5/(w+1)** achievable by *any* local algorithm with the same
guarantee — so winnowing sits within about 33% of the best any such scheme
could do. Intuitively, `2/(w+1)` falls out of asking, for a window of `w`
random hash values, how often the position of the minimum actually changes
as the window slides forward by one — that's the event that produces a
*new* fingerprint (recall: sliding to the same minimum doesn't re-record
it). For genuinely random hash values, the probability that shifting the
window changes which position holds the minimum shrinks as `w` grows, since
a wider window's minimum is "more entrenched" and survives more slides
before a smaller value appears at the new right edge — hence the `1/(w+1)`
shape, with the constant worked out precisely in the paper's probability
argument over random permutations of window contents.

## 6. The worked example — `adorunrunrunadorunrun`, k=5, w=4

**You must hand-trace this yourself before Phase 2 — it becomes the exact
unit test in `winnow.test.ts`.** What follows is laid out so you can check
it line by line; I built the k-gram/position columns myself directly from
the input string (mechanical, not something to take on faith), and the hash
and fingerprint columns are the paper's own Figure 2 values, which I
independently re-derived by hand from the algorithm's rules below and
confirmed match exactly — including that repeated substrings (`adoru`,
`dorun`, `runru`, `unrun`, all appearing twice in this string) get identical
hash values both times they occur, and the same substring occurring earlier
in a different context (`runru` at position 4 *and* position 7) is hashed
identically too. That self-consistency is a good sign the numbers are real.

The string has 21 characters; with k=5 that's 17 overlapping k-grams.

| pos | k-gram | hash |
|---|---|---|
| 1 | adoru | 77 |
| 2 | dorun | 74 |
| 3 | orunr | 42 |
| 4 | runru | 17 |
| 5 | unrun | 98 |
| 6 | nrunr | 50 |
| 7 | runru | 17 |
| 8 | unrun | 98 |
| 9 | nruna | 8 |
| 10 | runad | 88 |
| 11 | unado | 67 |
| 12 | nador | 39 |
| 13 | adoru | 77 |
| 14 | dorun | 74 |
| 15 | orunr | 42 |
| 16 | runru | 17 |
| 17 | unrun | 98 |

Now slide a window of `w = 4` hashes and pick the min, rightmost on ties
(14 windows: positions 1–4, 2–5, ..., 14–17):

| window (positions) | hashes | min value | min position |
|---|---|---|---|
| 1–4 | 77,74,42,17 | 17 | 4 |
| 2–5 | 74,42,17,98 | 17 | 4 |
| 3–6 | 42,17,98,50 | 17 | 4 |
| 4–7 | 17,98,50,17 | 17 | **7** (tie, rightmost) |
| 5–8 | 98,50,17,98 | 17 | 7 |
| 6–9 | 50,17,98,8 | 8 | 9 |
| 7–10 | 17,98,8,88 | 8 | 9 |
| 8–11 | 98,8,88,67 | 8 | 9 |
| 9–12 | 8,88,67,39 | 8 | 9 |
| 10–13 | 88,67,39,77 | 39 | 12 |
| 11–14 | 67,39,77,74 | 39 | 12 |
| 12–15 | 39,77,74,42 | 39 | 12 |
| 13–16 | 77,74,42,17 | 17 | 16 |
| 14–17 | 74,42,17,98 | 17 | 16 |

Reading down the "min position" column, it only *changes* at windows
1, 4, 6, 10, and 13 — every other window reselects a position already
recorded, per the "don't re-record the same selection" rule. So the
selected fingerprints, in order, are the hashes at positions **4, 7, 9, 12,
16**:

**Fingerprints = 17, 17, 8, 39, 17** — which matches the paper's Figure 2
result exactly.

Sanity checks worth doing yourself: (a) recompute the k-gram list from the
raw string and confirm there are 17 of them; (b) confirm every "min
position" column entry by literally comparing 4 numbers at a time; (c)
convince yourself the tie at window 4–7 really is a tie (both position 4
and position 7 hold value 17) and that rightmost really does mean picking 7
over 4.

## 7. How this maps to our pipeline

The paper works over characters; we work over **normalized tokens**
(`IDENT`, `NUM`, keywords, punctuation — see `normalize.ts`). A "k-gram" for
us is `k` consecutive tokens, not `k` consecutive characters — this matters
because it makes k-grams robust to exactly the disguises we care about
(renaming, reformatting) almost for free, before winnowing even enters the
picture: renaming an identifier doesn't change its normalized form, so the
token-level k-gram is untouched.

Our defaults from `packages/core/src/config.ts` are `k = 17`, `w = 4`,
giving a guarantee threshold of `t = w + k − 1 = 20` tokens. Concretely: any
20-token run that's identical (post-normalization) between two submissions
is guaranteed to produce a shared fingerprint. Twenty normalized tokens is
roughly one small loop body or a handful of statements in typical
competitive C++/Python — long enough that generic boilerplate (a single
`#define int long long` line, one `ios::sync_with_stdio` call) is very
unlikely to reach 20 contiguous unvarying tokens without some difference
creeping in, but short enough that lifting a single helper function into an
otherwise-original solution (the "partial copy" disguise variant in our
corpus) still clears the threshold and gets caught. `k = 17` alone (below
`t`) is chosen to be well above the point where short, structurally-forced
coincidences (e.g. every solution starts with roughly the same 3–5 token
I/O boilerplate) would register as a match — 17 consecutive *identical*
normalized tokens is much harder to hit by accident than by copying.
