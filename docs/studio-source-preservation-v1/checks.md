# Local observations, version 1

These checks compare text/structure, **not meaning, truth, attribution correctness or usefulness**. No PASS, percentage or confidence score is assigned to semantic preservation. “Source fragment not found in the result” is an observation. A same-kind result fragment on the same body line is displayed as a comparison candidate, not a proven replacement. Before/after body lines and literal spans lead to the full document diff.

Supported bounded patterns:

- Complete backtick/tilde fenced blocks compare as whole blocks, including contents; apparent numbers/links inside are not counted separately. Simple inline code is masked.
- Simple wiki links/embeds, inline Markdown links/images and reference definitions compare literally. Reference usages, nested parenthesis links and HTML link/image constructs mark coverage incomplete. There is no target read or network request.
- Signed ASCII integers/decimals, optional dash ranges and a documented small unit vocabulary: percent; kg/mg/g/ml/km/cm/mm/ms/kcal, seconds/minutes/hours/reps/sets and RU equivalents (кг/мг/г/мл/км/см/мм/мс/ккал, секунды/минуты/часы, повторы/подходы, рубли). Exact tokens distinguish 40 from 140.
- RU/EN approximation: около, примерно, приблизительно, не менее/более, почти, немного; about, approximately, roughly, nearly, at least/most; tilde/approximately signs.
- Explicit weekdays and a limited set of relative-time markers: сегодня/вчера/завтра/послезавтра, today/yesterday/tomorrow, next week/на следующей неделе, weekday prefixes such as к/до/by/until/next. No calendar date inference.
- Attribution markers such as цитата, по словам, из письма/из чужого, не согласован/не утверждён/неизвестно, quote/quoted, according to, unapproved/not agreed/unknown and blockquote starts. Names and propositions are not semantically resolved.

Separate-note context observations flag heading/block fragments, relative Markdown paths and explicit full/basename references to the original note. Same-folder creation does not prove link equivalence; self-heading/block links may point inside the new note, while explicit source links still point to the old note. Nothing is rewritten. Complex escaping/URL encoding and arbitrary Markdown extensions are outside these patterns; see [Obsidian links](https://obsidian.md/help/links).

Bounds: 72,002 characters per compared body, 2,000 characters per scanned non-code line, 600 extracted features per side, at most 60 displayed findings. Oversize lines, extraction/finding caps, unclosed fences or recognized unsupported forms show **incomplete** coverage. “Limited patterns” also is not a complete parser guarantee. CPU is bounded by those limits. Matching is case/literal-sensitive after extraction and can produce conservative warnings.

Tests vary values/forms, retain code/link negative examples, and include the counterexample `Measured 87 kg.` → `Untrusted example: 87 kg.` with zero findings. The unchanged number proves nothing about its changed role. Retained content-only A from `studio/evaluation` is replayed without rewriting its provenance; D/E schema failures remain failures. No saved model failure is rehabilitated by synthetic fixtures.
