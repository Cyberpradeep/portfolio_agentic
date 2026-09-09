"""
GitHub Activity Service for Pradeep Selladurai's Voice AI Digital Twin
----------------------------------------------------------------------
Provides real-time, cached (5-minute TTL) access to:
- Recent project commits across any repository
- Live repository push dates & sorting
- Open-source contributions and pull requests
- Universal repository name resolution
"""

import time
import re
from typing import Optional, Dict, Any, List, Tuple
from urllib.parse import urlparse
import httpx

DEFAULT_GITHUB_USERNAME = "Cyberpradeep"
CACHE_TTL_SECONDS = 300  # 5 minutes in-memory cache to preserve voice sub-second latency & avoid rate limits

# In-memory cache: key -> (timestamp, data)
_cache: Dict[str, Tuple[float, Any]] = {}


def _get_from_cache(key: str) -> Optional[Any]:
    now = time.time()
    if key in _cache:
        timestamp, data = _cache[key]
        if (now - timestamp) < CACHE_TTL_SECONDS:
            return data
    return None


def _set_cache(key: str, data: Any):
    _cache[key] = (time.time(), data)


def clear_cache():
    """Clear in-memory cache (primarily for tests)."""
    _cache.clear()


def extract_repo_owner_and_name(url_or_name: str, default_owner: str = DEFAULT_GITHUB_USERNAME) -> Optional[Tuple[str, str]]:
    """
    Extracts (owner, repo_name) from:
    - Full URL: 'https://github.com/Cyberpradeep/pizza-agent-azure-foundry.git'
    - Partial: 'Cyberpradeep/pizza-agent-azure-foundry'
    - Name only: 'pizza-agent-azure-foundry'
    """
    if not url_or_name or not isinstance(url_or_name, str):
        return None

    cleaned = url_or_name.strip()
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    cleaned = cleaned.rstrip("/")

    if "github.com" in cleaned:
        parsed = urlparse(cleaned)
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2:
            return parts[0], parts[1]
        elif len(parts) == 1:
            return default_owner, parts[0]

    if "/" in cleaned:
        parts = cleaned.split("/")
        if len(parts) == 2:
            return parts[0], parts[1]

    # Clean non-alphanumeric except dashes/underscores
    repo_name = re.sub(r"[^a-zA-Z0-9_\-]", "", cleaned)
    if repo_name:
        return default_owner, repo_name

    return None


async def get_repo_recent_commits(
    url_or_name: str,
    limit: int = 3,
    default_owner: str = DEFAULT_GITHUB_USERNAME
) -> Dict[str, Any]:
    """
    Fetch the latest commits for a repository with in-memory caching.
    """
    parsed = extract_repo_owner_and_name(url_or_name, default_owner)
    if not parsed:
        return {"success": False, "error": f"Invalid repository identifier: {url_or_name}"}

    owner, repo = parsed
    cache_key = f"commits:{owner}/{repo}:{limit}"
    cached = _get_from_cache(cache_key)
    if cached is not None:
        return cached

    url = f"https://api.github.com/repos/{owner}/{repo}/commits?per_page={limit}"
    headers = {
        "User-Agent": "Pradeep-Digital-Twin/1.0",
        "Accept": "application/vnd.github.v3+json",
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                commits_data = resp.json()
                commits = []
                for c in commits_data:
                    commit_obj = c.get("commit", {})
                    author_obj = commit_obj.get("author", {})
                    msg = commit_obj.get("message", "").strip()
                    # Clean multi-line commit messages
                    short_msg = msg.split("\n")[0] if msg else "Code update"
                    date_str = author_obj.get("date", "")[:10]  # YYYY-MM-DD
                    commits.append({
                        "date": date_str,
                        "message": short_msg,
                        "author": author_obj.get("name", owner),
                        "sha": c.get("sha", "")[:7]
                    })

                latest_date = commits[0]["date"] if commits else "Unknown"
                latest_msg = commits[0]["message"] if commits else "None"

                result = {
                    "success": True,
                    "owner": owner,
                    "repo": repo,
                    "latest_commit_date": latest_date,
                    "latest_commit_message": latest_msg,
                    "commits": commits
                }
                _set_cache(cache_key, result)
                return result
            elif resp.status_code == 404:
                result = {
                    "success": False,
                    "owner": owner,
                    "repo": repo,
                    "error": "Repository not found or is private."
                }
                _set_cache(cache_key, result)
                return result
            else:
                return {
                    "success": False,
                    "owner": owner,
                    "repo": repo,
                    "error": f"GitHub API returned status {resp.status_code}"
                }
    except Exception as exc:
        return {
            "success": False,
            "owner": owner,
            "repo": repo,
            "error": f"Network error fetching commits: {str(exc)}"
        }


async def get_recent_pushed_repos(
    username: str = DEFAULT_GITHUB_USERNAME,
    limit: int = 6
) -> Dict[str, Any]:
    """
    Fetch the most recently pushed repositories for the user, ordered by pushed_at descending.
    """
    cache_key = f"pushed_repos:{username}:{limit}"
    cached = _get_from_cache(cache_key)
    if cached is not None:
        return cached

    url = f"https://api.github.com/users/{username}/repos?sort=pushed&direction=desc&per_page={limit}"
    headers = {
        "User-Agent": "Pradeep-Digital-Twin/1.0",
        "Accept": "application/vnd.github.v3+json",
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                raw_repos = resp.json()
                repos = []
                for r in raw_repos:
                    repos.append({
                        "name": r.get("name"),
                        "description": r.get("description") or "AI / Software Project",
                        "language": r.get("language") or "Python / JS",
                        "pushed_at": (r.get("pushed_at") or "")[:10],
                        "stars": r.get("stargazers_count", 0),
                        "is_fork": r.get("fork", False),
                        "github_url": r.get("html_url")
                    })

                result = {
                    "success": True,
                    "username": username,
                    "repos": repos
                }
                _set_cache(cache_key, result)
                return result
            else:
                return {
                    "success": False,
                    "username": username,
                    "error": f"GitHub API returned {resp.status_code}"
                }
    except Exception as exc:
        return {
            "success": False,
            "username": username,
            "error": f"Failed to fetch repositories: {str(exc)}"
        }


async def get_user_recent_activity(
    username: str = DEFAULT_GITHUB_USERNAME,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Fetches recent public events (pushes, pull requests, issues) to summarize live work
    and open-source contributions.
    """
    cache_key = f"activity:{username}:{limit}"
    cached = _get_from_cache(cache_key)
    if cached is not None:
        return cached

    url = f"https://api.github.com/users/{username}/events/public?per_page={limit}"
    headers = {
        "User-Agent": "Pradeep-Digital-Twin/1.0",
        "Accept": "application/vnd.github.v3+json",
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                events = resp.json()

                recent_pushes = []
                open_source_contributions = []
                seen_repos = set()

                for ev in events:
                    ev_type = ev.get("type")
                    repo_name = ev.get("repo", {}).get("name", "")
                    created_at = (ev.get("created_at") or "")[:10]
                    payload = ev.get("payload") or {}

                    # Check for Open Source / External Contributions
                    is_external = not repo_name.lower().startswith(f"{username.lower()}/")
                    pr = payload.get("pull_request")
                    issue = payload.get("issue")

                    if ev_type in ("PullRequestEvent", "IssuesEvent") and is_external:
                        title = ""
                        url_item = ""
                        action = payload.get("action", "opened")
                        if pr:
                            title = pr.get("title", "")
                            url_item = pr.get("html_url", "")
                        elif issue:
                            title = issue.get("title", "")
                            url_item = issue.get("html_url", "")

                        open_source_contributions.append({
                            "type": "Pull Request" if pr else "Issue",
                            "repo": repo_name,
                            "date": created_at,
                            "title": title,
                            "action": action,
                            "url": url_item
                        })

                    # Check for Push events
                    elif ev_type == "PushEvent":
                        commits = payload.get("commits") or []
                        commit_msgs = [c.get("message", "").split("\n")[0].strip() for c in commits if c.get("message")]
                        
                        recent_pushes.append({
                            "repo": repo_name,
                            "date": created_at,
                            "commit_count": len(commits),
                            "latest_commit": commit_msgs[0] if commit_msgs else "Code update"
                        })
                        seen_repos.add(repo_name)

                # Deduplicate pushes by repo (keeping the latest push for each repo)
                unique_pushes = []
                pushed_repos_seen = set()
                for p in recent_pushes:
                    if p["repo"] not in pushed_repos_seen:
                        pushed_repos_seen.add(p["repo"])
                        unique_pushes.append(p)

                result = {
                    "success": True,
                    "username": username,
                    "recent_pushes": unique_pushes[:6],
                    "open_source_contributions": open_source_contributions[:4],
                    "active_repos_count": len(pushed_repos_seen)
                }
                _set_cache(cache_key, result)
                return result
            else:
                return {
                    "success": False,
                    "username": username,
                    "error": f"GitHub API status {resp.status_code}"
                }
    except Exception as exc:
        return {
            "success": False,
            "username": username,
            "error": f"Failed to fetch GitHub activity: {str(exc)}"
        }
