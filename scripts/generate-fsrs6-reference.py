"""Manual, offline fixture generation from a pinned py-fsrs checkout; never run by npm/CI.

Usage: python3 scripts/generate-fsrs6-reference.py /path/to/py-fsrs
The reference checkout needs its typing-extensions dependency; Veynrel does not.
No scheduling equations are implemented here: expected memory/intervals come from py-fsrs.
"""

import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
from datetime import datetime, timedelta, timezone

COMMIT = "9446cb06605c597a063aeee49f7d188d42e34dc2"
reference = Path(sys.argv[1]).resolve()
assert subprocess.check_output(["git", "-C", str(reference), "rev-parse", "HEAD"], text=True).strip() == COMMIT
subprocess.run(["git", "-C", str(reference), "diff", "--exit-code", "HEAD", "--", "fsrs", "pyproject.toml"], check=True)
sys.path.insert(0, str(reference))
from fsrs import Card, Rating, Scheduler, State  # noqa: E402

PARAMETERS = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
              1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
              1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
MINUTE = 60_000
DAY = 86_400_000
BASE = 1_773_014_400_000  # Fixed synthetic UTC epoch, never user data.
scheduler = Scheduler(parameters=PARAMETERS, desired_retention=0.90,
                      learning_steps=(timedelta(minutes=1), timedelta(minutes=10)),
                      relearning_steps=(timedelta(minutes=10),), maximum_interval=36500,
                      enable_fuzzing=False)
states = {"learning": State.Learning, "review": State.Review, "relearning": State.Relearning}
ratings = {name.lower(): rating for name, rating in Rating.__members__.items()}


def date(ms):
    return datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=ms)


def millis(value):
    return int((value - date(0)) / timedelta(milliseconds=1))


def card(schedule):
    return Card(card_id=1, state=states[schedule["phase"]], step=schedule.get("step"),
                stability=schedule.get("stability"), difficulty=schedule.get("difficulty"),
                due=date(schedule["dueAt"]),
                last_review=date(schedule["lastReviewAt"]) if "lastReviewAt" in schedule else None)


def review(schedule, rating, at):
    current = card(schedule)
    result, _ignored_reference_log = scheduler.review_card(current, ratings[rating], review_datetime=date(at))
    expected = {"algorithm": "fsrs-6", "policyVersion": 1, "phase": result.state.name.lower(),
                "dueAt": millis(result.due), "lastReviewAt": at,
                "stability": result.stability, "difficulty": result.difficulty,
                # Counters belong to Veynrel policy; py-fsrs does not own these fields.
                "reviewCount": schedule["reviewCount"] + 1,
                "lapseCount": schedule["lapseCount"] + int(schedule["phase"] == "review" and rating == "again"),
                "lastRating": rating}
    if result.step is not None:
        expected["step"] = result.step
    outcome = {"rating": rating, "schedule": expected, "intervalMs": millis(result.due) - at}
    if current.last_review is not None:
        outcome["retrievabilityBefore"] = scheduler.get_card_retrievability(current, current_datetime=date(at))
    return outcome


new = {"algorithm": "fsrs-6", "policyVersion": 1, "phase": "learning", "step": 0,
       "dueAt": BASE, "reviewCount": 0, "lapseCount": 0}
learning0 = review(new, "again", BASE)["schedule"]
learning1 = review(new, "good", BASE)["schedule"]
reviewing = review(new, "easy", BASE)["schedule"]
relearning = review(reviewing, "again", BASE + 8 * DAY)["schedule"]
scenarios = []


def sequence(name, initial, actions):
    current = initial
    rows = []
    for rating, at in actions:
        outcome = review(current, rating, at)
        rows.append({"rating": rating, "reviewedAt": at, "expected": outcome})
        current = outcome["schedule"]
    scenarios.append({"name": name, "initial": initial, "reviews": rows})


for rating in ratings:
    sequence(f"new-{rating}", new, [(rating, BASE)])
    for phase, seed in [("learning-step0", learning0), ("learning-step1", learning1),
                        ("review", reviewing), ("relearning", relearning)]:
        for days, gap in [("same-day", 10 * MINUTE), ("delayed", 3 * DAY + 7 * 60 * MINUTE)]:
            sequence(f"{phase}-{rating}-{days}", seed, [(rating, seed["lastReviewAt"] + gap)])
    for gap in [DAY - 1, DAY, DAY + 1]:
        sequence(f"24h-boundary-{gap}-{rating}", reviewing, [(rating, BASE + gap)])

sequence("learning-again-hard-good-progression", new,
         [("again", BASE), ("hard", BASE + MINUTE), ("good", BASE + 7 * MINUTE),
          ("hard", BASE + 17 * MINUTE), ("again", BASE + 27 * MINUTE),
          ("good", BASE + 28 * MINUTE), ("good", BASE + 38 * MINUTE)])
sequence("learning-easy-graduation", new, [("again", BASE), ("easy", BASE + MINUTE)])
sequence("lapse-and-relearning", reviewing,
         [("again", BASE + 8 * DAY), ("again", BASE + 8 * DAY + 10 * MINUTE),
          ("hard", BASE + 8 * DAY + 20 * MINUTE), ("good", BASE + 8 * DAY + 35 * MINUTE)])
sequence("multiple-early-same-day-reviews", reviewing,
         [(rating, BASE + (i + 1) * 60 * MINUTE) for i, rating in enumerate(["good", "hard", "easy", "again", "hard", "easy"])])
sequence("minimum-stability-and-maximum-difficulty", learning0,
         [("again", BASE + (i + 1) * MINUTE) for i in range(32)])
sequence("minimum-difficulty", reviewing, [("easy", BASE + (i + 1) * DAY) for i in range(8)])
sequence("long-overdue", reviewing, [("good", BASE + 10000 * DAY)])
sequence("maximum-interval", {**reviewing, "stability": 100000}, [("easy", BASE + 5000 * DAY)])
sequence("across-UTC-midnight-under-24h", {**reviewing, "lastReviewAt": millis(datetime(2026, 3, 8, 23, 59, tzinfo=timezone.utc))},
         [("good", millis(datetime(2026, 3, 9, 0, 1, tzinfo=timezone.utc)))])

probes = [{"name": "unreviewed", "schedule": new, "at": BASE, "expected": None}]
for elapsed in [-1, 0, 10 * MINUTE, DAY - 1, DAY, 10 * DAY, 1000 * DAY]:
    probes.append({"name": f"elapsed-{elapsed}", "schedule": reviewing, "at": BASE + elapsed,
                   "expected": scheduler.get_card_retrievability(card(reviewing), current_datetime=date(BASE + elapsed))})

fixture = {
    "reference": {"repository": "https://github.com/open-spaced-repetition/py-fsrs", "version": "6.3.2",
                  "commit": COMMIT, "schedulerSha256": hashlib.sha256((reference / "fsrs/scheduler.py").read_bytes()).hexdigest(),
                  "specification": "https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm#fsrs-6",
                  "generator": "scripts/generate-fsrs6-reference.py", "python": platform.python_version()},
    "parameters": PARAMETERS,
    "policy": {"desiredRetention": 0.90, "learningStepsMs": [MINUTE, 10 * MINUTE], "relearningStepsMs": [10 * MINUTE],
               "maximumIntervalDays": 36500, "fuzzing": False, "elapsedDays": "floor UTC duration / 86400000",
               "intervalRounding": "nearest integer, ties to even"},
    "scenarios": scenarios, "retrievability": probes,
    "intervals": [{"stability": s, "days": scheduler._next_interval(stability=s)}
                  for s in [0.001, 0.212, 1, 1.5, 2.5, 3.5, 10.25, 36500, 100000]],
}
destination = Path(__file__).resolve().parents[1] / "tests/fixtures/fsrs6-reference.json"
destination.write_text(json.dumps(fixture, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
print(f"Generated {len(scenarios)} scenarios / {sum(len(s['reviews']) for s in scenarios)} ratings: {destination}")
