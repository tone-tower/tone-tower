# Tone Tower heart balance

Each correct answer clears one floor. A wrong answer removes one heart, leaves the
player on the same floor, and consumes that recording. Sections are 20 clears
long. The four landings refill the meter. Between landings, a correct answer can
restore one missing heart. The summit ends the run.

| Difficulty | Starting hearts and cap | Drop chance at one heart |
| ---------- | ----------------------: | -----------------------: |
| Easy       |                       5 |                      23% |
| Normal     |                       4 |                      23% |
| Hard       |                       3 |                      23% |
| Extreme    |                       2 |                      25% |

If the player has `h` hearts and a cap of `H`, the drop probability is
`q × (H − h) / (H − 1)`, where `q` is the chance at one heart. It is zero at
full health or when the cap is one. For example, Normal gives 7.67% at three
hearts, 15.33% at two, and 23% at one. Official Skyrail runs use the same caps and drop chances for Easy through
Extreme. Finite practice uses the original caps and midpoint heart. The
balance model below estimates Tone Tower outcomes.

## From tone confusions to prompt accuracy

Each language gets a **full-set accuracy benchmark** for a hypothetical
reference listener. The defaults are **90% Mandarin**, **87% Cantonese**, and
**88% Vietnamese**. These are adjustable design assumptions. The studies
used different listeners, recording contexts, and response formats.

For a heard tone `t` and a visible wrong answer `d`, assign an error weight
`w(t, d)` with a default of 1. The weights are directional. The defaults below
encode groups of confusions suggested by the research. Their magnitudes are
heuristic multipliers.

| Language   | Weight overrides                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mandarin   | 1 ↔ 2 is 2, 1 ↔ 4 is 3, 2 → 3 is 6, and 3 → 2 is 12                   | In one normal-speech experiment, learners heard 3 as 2 in 22% of tone-3 trials and 2 as 3 in 7% of tone-2 trials. The neutral tone keeps the default weight because the studies tested four tones. [Normal-speech identification](https://www.mdpi.com/2076-328X/15/8/1062), [cross-language confusions](https://pmc.ncbi.nlm.nih.gov/articles/PMC2897724/) |
| Cantonese  | 2 ↔ 5 and 3 ↔ 6 are 6 each. 4 ↔ 6 is 3.                               | These contrast two rising tones, two level tones, and a low falling and low level tone, respectively. They recur in perception studies. [Mok and Zuo](https://www.cuhk.edu.hk/lin/people/peggy/MokZuo_JASA2012.pdf)                                                                                                                                         |
| Vietnamese | huyền → ngang, hỏi → huyền, and hỏi → nặng are 6. ngang → huyền is 3. | A study of Mandarin-speaking learners found these salient error directions when listening to Northern Vietnamese. The reverse level-tone weight is a modeling assumption. [Chen et al.](https://www.isca-archive.org/interspeech_2023/chen23d_interspeech.pdf)                                                                                              |

The calculator gives the correct answer weight 1 and each visible decoy weight
`s × w(t, d)`. The predicted probability of a correct response is then
`1 / (1 + s × sum of visible decoy weights)`. This is a [Luce choice
model](https://escholarship.org/uc/item/02b7s10w). It preserves the relative
odds of two choices when another choice is added, a useful approximation for
calculating how the random set of doors changes accuracy.

The calculator fits `s` so the mean accuracy with every tone visible matches
the full-set benchmark. It then enumerates equally likely decoy subsets for
the language's actual door counts and averages the result for each heard
tone. At the Mandarin benchmark, for example, a tone-2 prompt gives about
90% accuracy with doors 1, 2, and 3 and about 96% with doors 1, 2, and 4.

| Language   | 2 doors | 3 doors | 4 doors | Full set, sections 4–5 |
| ---------- | ------: | ------: | ------: | ---------------------: |
| Mandarin   |     97% |     95% |     92% |                    90% |
| Cantonese  |     97% |     94% |     92% |                    87% |
| Vietnamese |     97% |     95% |     92% |                    88% |

## From prompt accuracy to floor clears

The calculator propagates probability mass through states consisting of the
number of clears, available hearts, and the tones remaining in the current
shuffled bag. The initial state has zero clears, full hearts, and a full bag.
To evaluate a state:

1. Pick one remaining tone with equal probability, remove it from the bag,
   and refill the bag once empty. Get the mean correct-response probability
   for that tone and the current section's door count.
2. Put the mistake branch one heart lower on the same floor. At zero hearts,
   the branch ends.
3. Advance the correct branch one floor. Split it between unchanged hearts
   and one recovered heart using the drop probability. At a landing the
   branch advances with full hearts.

The surviving mass at a checkpoint is the probability of reaching it.
Dividing by the mass at the previous checkpoint gives the conditional clear
rate. The final surviving mass is the unconditional probability of winning
the tower. The calculator carries the shuffled bag across checkpoints.

The estimate treats prompts with the same tone and door set alike. Actual
recordings vary by speaker, word, and tone context. The model uses a complete
tone inventory in every bag and independent responses given a prompt.
Recording depletion, fatigue, repeated errors, and practice between runs can
all change observed win rates. In the reference scenario, Normal win odds
for Mandarin are about **50%, 82%, and 98%** at **85%, 90%, and 95%**
full-set accuracy. Accuracy means success per resolved prompt.

## Calibration and reports

The calibration target is **25% fewer section failures** than the old midpoint
rule, averaging each language and section equally. For example, if the
midpoint rule clears 80% of sections, the target is 85%. Calibration holds
each tier's selected cap fixed so it measures the change in recovery alone.
The report also compares whole-tower win rates with the actual old caps,
including one-heart Extreme.

The tool searches for the lowest last-heart drop rate that reaches the target.
The game uses rounded starting rates. The inverse search holds those rules
fixed and finds the full-set accuracy at which the modeled win chance is 50%.

Run `npm run balance:hearts` to refresh the [reference graph
report](heart-balance-report.html). Open the HTML file in a browser. It
includes the full-set accuracy sweep, section clear charts, and the values
behind each plot.

To compare a scenario, save a JSON file with only the settings you want to
override. Numeric values for probabilities are fractions from 0 to 1, with
full-set accuracy above zero.

```json
{
  "fullSetAccuracy": { "cmn": 0.85, "yue": 0.82 },
  "heartCaps": { "normal": 5 },
  "lastHeartDropChance": { "normal": 0.35 },
  "failureReduction": 0.3
}
```

```sh
npm run balance:hearts -- --config my-scenario.json --out my-scenario.html
```

With `--config`, omitting `--out` saves the comparison in the OS temporary
directory. The command prints the report path.
