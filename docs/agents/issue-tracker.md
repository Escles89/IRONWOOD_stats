# Issue tracker: GitHub

Issues and specs live in GitHub Issues for this repository. Use the `gh` CLI from the repo checkout; it resolves the repository from the Git remote.

## Conventions

- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`, adding appropriate label or state filters.
- Comment: `gh issue comment <number> --body-file <file>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

For multiline bodies, write the exact text to a temporary file and pass `--body-file`.

“Publish to the issue tracker” means create a GitHub issue.
“Fetch the relevant ticket” means read the issue, including labels and comments.

## Pull requests as a triage surface

**PRs as a request surface: no.**

If enabled later, use the corresponding `gh pr` operations and read the diff. Include external contributors' PRs in triage, excluding owner, member, and collaborator PRs.

GitHub issues and PRs share a number space. When the type is unclear, resolve it with `gh pr view <number>` and fall back to `gh issue view <number>`.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes, Decisions-so-far, and Fog.
- Child ticket: link to the map as a GitHub sub-issue. If unavailable, use a task list in the map and `Part of #<map>` in the child.
- Type labels: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Blocking: use native GitHub issue dependencies. If unavailable, use `Blocked by: #<number>` lines in the child body. A ticket is unblocked when every blocker is closed.
- Frontier: choose the first open, unassigned child in map order with no open blockers.
- Claim: assign the ticket to the driving developer using `gh issue edit <number> --add-assignee @me`.
- Resolve: comment with the result, close the child, and add a short finding plus its link to the map's Decisions-so-far.
