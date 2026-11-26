"""Patch a COPY of prs-panel's forge-helper.py so GitHub PR fetching returns mock PRs (no network, no tokens)."""

import sys
from pathlib import Path

MARKER = "    del env\n    token, err = resolve_gh_cli_token(gh_cfg)\n"
MOCK = """    del env
    import datetime as _d

    def _pr(n, title, repo, branch, ci, review, mine, draft=False, appr=0, files=4, add=120, dele=18, hrs=3):
        t = (_d.datetime.now(_d.timezone.utc) - _d.timedelta(hours=hrs)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {
            "key": f"github:acme/{repo}#{n}", "profileId": profile_id, "provider": "github", "repo": f"acme/{repo}",
            "repoShort": repo, "localPath": local_repos.get(f"github:acme/{repo}"), "number": n, "title": title,
            "url": f"https://github.com/acme/{repo}/pull/{n}", "author": "octocat" if mine else "hubot",
            "isMine": mine, "isReviewRequested": not mine, "draft": draft, "createdAt": t, "updatedAt": t,
            "sourceBranch": branch, "targetBranch": "main", "headSha": "a1b2c3d4e5f6", "ciState": ci, "checks": [],
            "reviewState": review, "approvals": appr, "changesRequested": 1 if review == "changes_requested" else 0,
            "reviewers": [], "conflicts": False, "commentCount": 3,
            "unresolvedCount": 1 if review == "changes_requested" else 0,
            "additions": add, "deletions": dele, "changedFiles": files,
        }

    # The first sync is quiet; later ones flip PR #41 to failing CI and #42 to a new approval, which raises
    # the PR notifications the Inbox lists.
    calls = Path.home() / ".forge-demo-calls"
    n = int(calls.read_text()) if calls.exists() else 0
    calls.write_text(str(n + 1))
    later = n >= 1
    return [
        _pr(42, "Add greeting endpoint", "acme-api", "feat/greeting", "success", "approved" if later else "none", True, appr=2 if later else 0, hrs=2),
        _pr(41, "Fix pagination off-by-one", "web-app", "fix/pagination", "failure" if later else "pending", "changes_requested", True, hrs=5),
        _pr(40, "Draft: dark mode tokens", "web-app", "feat/dark-mode", "pending", "none", True, draft=True, hrs=9),
        _pr(39, "Upgrade dependencies", "docs-site", "chore/deps", "success", "none", False, hrs=20, files=2),
    ], None
"""


def main() -> None:
    """Stub the GitHub fetch in the helper file given as argv[1]."""
    path = Path(sys.argv[1])
    source = path.read_text()
    if MARKER not in source:
        raise SystemExit("forge-helper.py changed: stub marker not found")
    path.write_text(
        source.replace(
            MARKER, MOCK + "    token, err = resolve_gh_cli_token(gh_cfg)\n", 1
        )
    )


if __name__ == "__main__":
    main()
