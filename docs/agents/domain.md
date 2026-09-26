# Domain Docs

## Before exploring

This repository uses a single-context layout.

- Read `CONTEXT.md` at the repo root.
- Read ADRs in `docs/adr/` that concern the area being explored.

If these files or directories are absent, proceed silently.
The domain-modeling skill creates them as terms or decisions are resolved.

## File structure

- `CONTEXT.md`: shared domain vocabulary.
- `docs/adr/NNNN-short-title.md`: architectural decision records.

## Use the glossary's vocabulary

Use the terms defined in `CONTEXT.md` in issue titles, proposals,
hypotheses, and test names. Respect its explicitly avoided synonyms.

If a needed concept is missing, reconsider whether it belongs to the
domain or note the vocabulary gap for domain-modeling.

## Flag ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR,
link the decision, and explain why it should be reconsidered.
