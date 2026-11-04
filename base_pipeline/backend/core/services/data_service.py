"""
Data Service: In-memory cached portfolio knowledge base loader and query resolver.
Loads structured JSON files once on startup to eliminate repetitive disk I/O in async loops.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from config import DATA_DIR

# In-memory storage for JSON datasets
_CACHE: Dict[str, Any] = {}


def _load(filename: str) -> Any:
    if filename not in _CACHE:
        file_path = DATA_DIR / filename
        if not file_path.exists():
            return {}
        with open(file_path, "r", encoding="utf-8") as f:
            _CACHE[filename] = json.load(f)
    return _CACHE[filename]


def preload_all_data():
    """Warm up in-memory cache on application startup."""
    filenames = [
        "about.json",
        "projects.json",
        "skills.json",
        "certifications.json",
        "experience.json",
        "achievements.json",
        "portfolio_faqs.json"
    ]
    for fn in filenames:
        _load(fn)
    print(f"[DATA_SERVICE] Preloaded {len(_CACHE)} knowledge datasets into memory.")


def get_about_data() -> dict:
    return _load("about.json")


def get_projects_data() -> dict:
    return _load("projects.json")


def get_skills_data() -> dict:
    return _load("skills.json")


def get_experience_data() -> dict:
    return _load("experience.json")


def get_certifications_data() -> dict:
    return _load("certifications.json")


def get_achievements_data() -> dict:
    return _load("achievements.json")


def get_faqs_data() -> dict:
    return _load("portfolio_faqs.json")


def find_project(project_name: str) -> Optional[dict]:
    """
    Finds project using exact name, alias, substring, or keyword intersection.
    """
    if not project_name or not str(project_name).strip():
        return None

    clean_query = str(project_name).strip().lower()
    data = get_projects_data()
    projects = data.get("projects", [])

    # 1. Exact, alias, or substring match
    for proj in projects:
        aliases = proj.get("aliases", [])
        p_name = proj.get("name", "").lower()
        p_id = proj.get("id", "").lower()
        if (
            clean_query in p_name
            or clean_query in p_id
            or any(clean_query in str(a).lower() for a in aliases)
            or any(str(a).lower() in clean_query for a in aliases)
        ):
            return proj

    # 2. Word-level fuzzy matching against name, id, and aliases
    query_words = set(clean_query.split())
    for proj in projects:
        aliases = proj.get("aliases", [])
        alias_words = []
        for a in aliases:
            alias_words.extend(str(a).lower().split())
        proj_words = set(proj.get("name", "").lower().split() + proj.get("id", "").lower().split() + alias_words)
        if len(query_words.intersection(proj_words)) >= 2 or any(qw in proj.get("name", "").lower() for qw in query_words if len(qw) > 4):
            return proj

    # 3. Fallback: match summary or category keywords
    for proj in projects:
        summary = proj.get("summary", "").lower()
        category = [c.lower() for c in proj.get("category", [])] if isinstance(proj.get("category"), list) else []
        if any(qw in summary for qw in query_words if len(qw) > 3) or any(qw in category for qw in query_words):
            return proj

    return None


def resolve_certification(query: str) -> Optional[dict]:
    """
    Matches certification name or keywords against verified credentials.
    """
    if not query or not str(query).strip():
        return None

    q = str(query).strip().lower()
    data = get_certifications_data()
    completed = data.get("completed_certifications", [])

    # Azure AI Apps and Agents Developer Associate (AI-103 / AI-102)
    if any(k in q for k in ["104", "103", "102", "associate", "agent", "apps and agent", "ai app", "azure ai agent"]):
        for c in completed:
            c_name = c.get("name", "").lower()
            if "apps and agents" in c_name or "ai-10" in c.get("code", "").lower() or "ai-10" in c_name:
                return c

    # Azure AI Fundamentals (AI-900)
    if any(k in q for k in ["900", "fundamental", "azure ai fundamental", "ai-900"]):
        for c in completed:
            if "fundamentals" in c.get("name", "").lower() and "azure" in c.get("name", "").lower():
                return c

    # GitHub Foundations (GH-900)
    if any(k in q for k in ["github", "gh-900", "git"]):
        for c in completed:
            if "github" in c.get("name", "").lower():
                return c

    # Distributed Systems
    if "distributed" in q:
        for c in completed:
            if "distributed" in c.get("name", "").lower():
                return c

    # Edge Computing
    if "edge" in q:
        for c in completed:
            if "edge" in c.get("name", "").lower():
                return c

    # EC-Council / Android Bug Bounty
    if any(k in q for k in ["bug bounty", "android", "rat", "ec-council"]):
        for c in completed:
            if "bug bounty" in c.get("name", "").lower() or "ec-council" in c.get("provider", "").lower():
                return c

    # Cisco
    if any(k in q for k in ["cisco", "network", "tcp"]):
        for c in completed:
            if "cisco" in c.get("provider", "").lower() or "network" in c.get("name", "").lower():
                return c

    # Cyber Security
    if any(k in q for k in ["cyber", "oxford", "tata"]):
        for c in completed:
            if "cyber" in c.get("name", "").lower() or "cyber" in c.get("category", "").lower():
                return c

    # Substring fallback
    for c in completed:
        if q in c.get("name", "").lower() or c.get("name", "").lower() in q:
            return c

    return None


def search_faqs(query: str) -> List[dict]:
    if not query or not str(query).strip():
        return []
    clean_q = str(query).strip().lower()
    query_tokens = [t for t in clean_q.split() if len(t) > 2]
    data = get_faqs_data()
    scored_results = []

    for category in data.values():
        if isinstance(category, list):
            for faq in category:
                if not isinstance(faq, dict):
                    continue
                q_text = faq.get("question", "").lower()
                q_id = faq.get("id", "").lower()
                a_text = faq.get("answer", "").lower()

                score = 0
                if clean_q in q_text:
                    score += 10
                if clean_q in q_id:
                    score += 8
                if clean_q in a_text:
                    score += 4

                for tok in query_tokens:
                    if tok in q_text:
                        score += 3
                    elif tok in q_id:
                        score += 2
                    elif tok in a_text:
                        score += 1

                if score > 0:
                    scored_results.append((score, faq))

    scored_results.sort(key=lambda x: x[0], reverse=True)
    seen_ids = set()
    deduped = []
    for _, faq in scored_results:
        fid = faq.get("id")
        if fid not in seen_ids:
            seen_ids.add(fid)
            deduped.append(faq)

    return deduped[:5]
