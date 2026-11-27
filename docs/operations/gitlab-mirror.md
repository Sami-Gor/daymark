# GitLab mirror

The repository is also published to a public GitLab copy at
<https://gitlab.com/Sami-Gor/daymark>. The publisher is the
`Mirror to GitLab` workflow in
[`.github/workflows/mirror-to-gitlab.yml`](../../.github/workflows/mirror-to-gitlab.yml).
This page records what the mirror publishes, why some GitHub refs are
deliberately not published, and how to reconcile a divergent ref without
discarding history.

## What the mirror publishes

- every GitHub branch, except ephemeral Dependabot pull-request branches
  (`refs/heads/dependabot/*`);
- every GitHub tag.

It runs on every push, on an hourly schedule, and on manual dispatch:

```sh
gh workflow run "Mirror to GitLab" --repo Sami-Gor/daymark
```

Each ref is pushed with its own `git push`, so one rejected ref does not stop
the others from being attempted. The job summary lists the mirrored ref count,
the skipped Dependabot refs, the GitLab-only refs that were preserved, and any
ref that failed to mirror.

## What the mirror never does

- No force pushes. The workflow never passes `--force` or
  `--force-with-lease`; a ref that cannot be published fast-forward is
  reported and the job fails instead of being overwritten.
- No pruning. A branch or tag that exists on GitLab but not on GitHub is left
  in place on purpose. Deleting it would discard GitLab-side history without
  an explicit owner decision.
- No tag rewrites.

## Why Dependabot branches are excluded

Dependabot rebases (force-pushes) its pull-request branches whenever the base
branch moves. A branch that was mirrored once can therefore never be published
again by a non-force push: the GitLab ref has commits that the rewritten GitHub
ref does not contain, so the push is rejected as non-fast-forward. Because the
GitLab copy of an open Dependabot branch stays divergent until the PR is closed
and its branch deleted, a workflow that keeps trying to publish it fails on
every single run.

These refs are ephemeral PR heads rather than stable repository state, so the
workflow now skips them. The existing GitLab-side copy is left untouched (it is
not deleted or overwritten); it simply stops being updated.

Observed example (2026-11-18), branch
`dependabot/npm_and_yarn/lucide-react-1.48.0` (PR #31):

| Side | Commit | Subject | Author date |
| --- | --- | --- | --- |
| GitHub | `a8a0329a8efc319f07fe2ee27e5c3d001423dee1` | chore: bump lucide-react from 0.545.0 to 1.73.0 | 2026-11-17T19:45:58Z |
| GitLab | `d02036762e8641bf46ea7e83d5097723be400e51` | chore: bump lucide-react from 0.545.0 to 1.48.0 | 2026-10-01T02:59:35Z |

- GitHub head parent: `6c7dfd0247c896260b4fd994e9e592bb19128f8d`.
- GitLab head parent / merge base: `cc724d550e0a4de4fd053dacb2ea032636228346`
  (`ci: add automatic GitLab mirror`).
- The GitHub head is a legitimate Dependabot rebase: the PR timeline records a
  `head_ref_force_pushed` event by `dependabot[bot]` at 2026-11-17T19:46:00Z.
- The GitLab head is not an ancestor of the GitHub head, so the mirror push is
  a non-fast-forward. The scheduled run of 2026-11-17T22:53Z failed solely on
  this ref (`[rejected] (fetch first)`); every other branch and tag mirrored
  successfully.

The same failure mode affected other open Dependabot branches in earlier runs
(for example `dependabot/github_actions/pnpm/action-setup-6.1.0`). The
problem clears itself when a Dependabot PR is closed or merged and its branch
deleted on GitHub, because the ref is then no longer in the push set - but the
stale GitLab copy remains, which is why the workflow reports GitLab-only refs.

## Reconciling a divergent ref

Never force-push the mirror. Work through the following steps instead.

1. Identify both sides. Run:

   ```sh
   git ls-remote https://github.com/Sami-Gor/daymark.git "refs/heads/<branch>"
   git ls-remote https://gitlab.com/Sami-Gor/daymark.git "refs/heads/<branch>"
   ```

   then fetch both commits and compare `git show -s --format='%H %P %an %aI %s'`
   and `git merge-base` output.

2. Classify the ref.

   - Ephemeral Dependabot branch: no action. It is excluded from publishing and
     its GitLab copy is intentionally preserved.
   - Stable branch that was force-pushed on GitHub: decide whether the
     GitLab-only commits are wanted.
     - If they are wanted, the non-destructive repair is to publish a
       forward-only merge on GitHub that has both heads as parents. The next
       mirror run then fast-forwards the GitLab ref, so no GitLab history is
       lost and no force push is needed.
     - If they are not wanted, only the repository owner may delete the GitLab
       ref, and that decision must be explicit: deleting a ref discards
       GitLab-side history.
   - Tag: tags are never rewritten by the mirror. A moved tag needs an owner
     decision, not a mirror change.

3. Until the ref is reconciled, the mirror job keeps failing on it. That is the
   intended signal; do not silence it with a force push or by disabling the
   workflow.

## Cleaning up stale GitLab-only refs

Refs that exist only on GitLab are preserved by design. They are reported in
the job summary on every run. Examples are Dependabot branches deleted after
their PR merged, and old scratch tags created directly on GitLab.

List them with any GitLab API client:

```sh
glab api 'projects/Sami-Gor%2Fdaymark/repository/branches?search=dependabot&per_page=100' --output json
```

Deleting them requires a GitLab Maintainer or Owner, for example through the
GitLab web UI (Repository > Branches) or the API. It is a deliberate owner
action: the workflow will not delete refs.

## Verifying a mirror run

- The `Verify default branch` step compares the GitHub and GitLab default
  branch SHAs and fails if they differ.
- The job summary reports how many refs were mirrored, which Dependabot refs
  were skipped, which GitLab-only refs were preserved, and which refs failed.
- The workflow file itself is validated like every other workflow:
  `ruby -e 'require "yaml"; Psych.parse_file(".github/workflows/mirror-to-gitlab.yml")'`.
  Documentation is checked by `node scripts/ci/validate-docs.mjs`.
