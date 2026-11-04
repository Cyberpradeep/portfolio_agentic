"""
Text AI Tool Schemas & Dispatcher for Groq Qwen.
Provides 100% tool parity with the Voice track, delegating execution to core.services
and broadcasting GenUI updates strictly to the calling session.
"""

from typing import Any, Dict, List
from core.connection_registry import connection_registry
from core.services import data_service, email_service, github_service

TEXT_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_about",
            "description": "Fetches Pradeep's educational background, college, CGPA, degree, and career transition story from Cyber Security to AI.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "show_projects",
            "description": "Displays all of Pradeep's featured projects as interactive GenUI cards on the user's screen. Call this when the user asks to see, list, or explore projects.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_project_details",
            "description": "Fetches deep architectural details, metrics, and latest GitHub commits for a specific project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {
                        "type": "string",
                        "description": "The exact or partial name of the project (e.g. 'Hospital Voice AI Assistant', 'PizzaBot', 'English Tutor Companion', 'AI Code Reviewer')."
                    }
                },
                "required": ["project_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_best_project",
            "description": "Recommends Pradeep's flagship project and explains his core engineering competencies.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "show_skills",
            "description": "Displays the interactive technical proficiency taxonomy matrix on screen. Call this when discussing languages, backend, AI frameworks, or tools.",
            "parameters": {
                "type": "object",
                "properties": {
                    "skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of specific skill tags to emphasize (e.g. ['python', 'fastapi', 'gemini live'])."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "show_experience",
            "description": "Displays Pradeep's career experience and chronology timeline on the screen. Call this when the user asks about career, internships, or work history.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "show_certifications",
            "description": "Projects verified certifications onto the 3D robot TV screen and opens credentials slate. Call when user asks about certifications or specific credentials like Azure AI Apps and Agents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "certification_name": {
                        "type": "string",
                        "description": "Optional name, code, or keyword of a specific certificate (e.g. 'Azure AI Apps and Agents', 'AI-103', 'AI-900', 'GitHub Foundations')."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_achievements",
            "description": "Fetches Pradeep's hackathons, conferences, open-source pull requests, and milestones.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_faq",
            "description": "Searches answers to technical, engineering, and personal interview FAQs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The FAQ question or keyword to search for"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_github_activity",
            "description": "Fetches Pradeep's live real-time GitHub activity, recent repository commits, push events, and open-source contributions.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_contact_email",
            "description": "Sends an email containing the visitor's contact info and inquiry to Pradeep.",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_email": {"type": "string", "description": "The visitor's email address"},
                    "user_message": {"type": "string", "description": "The inquiry or message from the visitor"},
                    "email_subject": {"type": "string", "description": "A brief 2 to 5 word subject line"}
                },
                "required": ["user_email", "user_message", "email_subject"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_resume",
            "description": "Sends Pradeep's resume PDF directly to the specified email address.",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_email": {"type": "string", "description": "User email address to send the resume to"}
                },
                "required": ["user_email"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "open_link",
            "description": "Opens an external URL (e.g. GitHub repository, LinkedIn profile, or live demo) on the visitor's screen.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The exact URL to open"}
                },
                "required": ["url"]
            }
        }
    }
]


async def execute_text_tool(name: str, args: dict, session_id: str) -> Dict[str, Any]:
    """
    Executes a requested tool function and broadcasts GenUI updates to session_id.
    """
    if name in ("get_about", "show_about"):
        return data_service.get_about_data()

    elif name in ("show_projects", "get_projects"):
        data = data_service.get_projects_data()
        cards = []
        for proj in data.get("projects", []):
            techs = proj.get("technologies", [])
            if isinstance(techs, dict):
                flat = []
                for v in techs.values():
                    if isinstance(v, list):
                        flat.extend(v)
                techs = flat[:3]
            elif isinstance(techs, list):
                techs = techs[:3]
            cards.append({
                "id": proj["id"],
                "name": proj["name"],
                "summary": proj.get("summary", "")[:80],
                "techs": techs,
                "type": proj.get("type", ""),
                "github_url": proj.get("github_url", "")
            })
        await connection_registry.broadcast_to_session(session_id, {
            "type": "show_projects",
            "projects": cards
        })
        return {
            "success": True,
            "count": len(cards),
            "projects": [p["name"] for p in cards]
        }

    elif name in ("get_project_details", "get_project"):
        proj_name = args.get("project_name", "")
        matched = data_service.find_project(proj_name)

        if matched:
            project_copy = dict(matched)
            github_url = matched.get("github_url")
            if github_url:
                try:
                    commit_info = await github_service.get_repo_recent_commits(github_url, limit=3)
                    if commit_info.get("success"):
                        project_copy["recent_git_activity"] = {
                            "latest_commit_date": commit_info.get("latest_commit_date"),
                            "latest_commit_message": commit_info.get("latest_commit_message"),
                            "recent_commits": commit_info.get("commits", [])
                        }
                except Exception as exc:
                    print(f"[TEXT_COMMIT_ERR] {exc}")

            await connection_registry.broadcast_to_session(session_id, {
                "type": "show_project",
                "project": project_copy
            })
            return {"found": True, "project": project_copy}

        # Fallback to direct repo commit search
        try:
            commit_info = await github_service.get_repo_recent_commits(proj_name, limit=3)
            if commit_info.get("success"):
                repo_slug = commit_info["repo"]
                adhoc = {
                    "id": repo_slug,
                    "name": repo_slug.replace("-", " ").replace("_", " ").title(),
                    "type": "GitHub Repository",
                    "summary": f"A repository by Pradeep Selladurai with live updates on {commit_info['latest_commit_date']}.",
                    "github_url": f"https://github.com/Cyberpradeep/{repo_slug}",
                    "recent_git_activity": {
                        "latest_commit_date": commit_info.get("latest_commit_date"),
                        "latest_commit_message": commit_info.get("latest_commit_message"),
                        "recent_commits": commit_info.get("commits", [])
                    }
                }
                await connection_registry.broadcast_to_session(session_id, {
                    "type": "show_project",
                    "project": adhoc
                })
                return {"found": True, "project": adhoc}
        except Exception as exc:
            print(f"[TEXT_ADHOC_ERR] {exc}")

        projects = data_service.get_projects_data().get("projects", [])
        return {
            "found": False,
            "message": f"Project not found. Available: {', '.join(p['name'] for p in projects)}"
        }

    elif name == "get_best_project":
        return {
            "flagship": "Hospital Voice AI Assistant",
            "differentiators": ["Voice AI", "Agentic AI", "Sub-800ms latency", "Deterministic FSMs", "Generative UI"]
        }

    elif name in ("show_skills", "get_skills"):
        skills_arg = args.get("skills", [])
        quadrants = [
            {"title": "Languages & Backend", "items": ["Python", "FastAPI", "Flask", "Java", "WebSockets", "MySQL", "MongoDB"]},
            {"title": "Frontend & Tools", "items": ["React", "JavaScript", "HTML", "CSS", "ThreeJS", "Docker", "Git"]},
            {"title": "AI & Agentic Systems", "items": ["Agentic AI", "Voice AI", "Gemini Live", "CrewAI", "Pipecat", "RAG", "Tool Calling"]},
            {"title": "Concepts & Cloud", "items": ["Context Engineering", "Prompt Engineering", "Azure", "Railway", "HuggingFace"]}
        ]
        await connection_registry.broadcast_to_session(session_id, {
            "type": "show_skills",
            "skills": skills_arg,
            "quadrants": quadrants
        })
        return {"success": True, "categories": [q["title"] for q in quadrants]}

    elif name in ("show_experience", "get_experience"):
        data = data_service.get_experience_data()
        await connection_registry.broadcast_to_session(session_id, {
            "type": "show_experience",
            "experience": data
        })
        return {"success": True, "experience": data}

    elif name in ("show_certifications", "get_certifications"):
        cert_query = args.get("certification_name", "")
        data = data_service.get_certifications_data()
        matched = data_service.resolve_certification(cert_query) if cert_query else None

        if matched:
            payload = {
                "type": "show_certifications",
                "certifications": [matched],
                "active_image": matched.get("image") or "/static/assests/azure_ai_apps_and_agents_associate.png",
                "title": matched.get("name"),
                "single_cert": True
            }
            await connection_registry.broadcast_to_session(session_id, payload)
            return {"matched": True, "certification": matched["name"], "image": matched.get("image")}

        completed = data.get("completed_certifications", [])
        cert_images = [
            {"url": c["image"], "title": c["name"], "code": c.get("code", "")}
            for c in completed if c.get("image")
        ]
        payload = {
            "type": "show_certifications",
            "certifications": completed[:4],
            "active_image": cert_images[0]["url"] if cert_images else "/static/assests/azure_ai_apps_and_agents_associate.png",
            "title": cert_images[0]["title"] if cert_images else "Microsoft Certified: Azure AI Apps and Agents Developer Associate",
            "single_cert": False,
            "images": cert_images
        }
        await connection_registry.broadcast_to_session(session_id, payload)
        return {"matched": False, "count": len(completed), "certifications": [c["name"] for c in completed]}

    elif name in ("get_achievements", "show_achievements"):
        return data_service.get_achievements_data()

    elif name in ("search_faq", "search_faqs"):
        query = args.get("query", "")
        results = data_service.search_faqs(query)
        return {"count": len(results), "faqs": results}

    elif name == "get_github_activity":
        try:
            activity = await github_service.get_user_recent_activity(limit=25)
            pushed_repos = await github_service.get_recent_pushed_repos(limit=6)
            payload = {
                "type": "show_github_activity",
                "recent_pushes": activity.get("recent_pushes", []),
                "open_source_contributions": activity.get("open_source_contributions", []),
                "latest_repos": pushed_repos.get("repos", [])
            }
            await connection_registry.broadcast_to_session(session_id, payload)
            return {
                "success": True,
                "recent_pushes_count": len(activity.get("recent_pushes", [])),
                "latest_repos": [r["name"] for r in pushed_repos.get("repos", [])[:3]]
            }
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    elif name == "send_contact_email":
        user_email = args.get("user_email")
        user_message = args.get("user_message")
        email_subject = args.get("email_subject")
        return await email_service.send_contact_email_async(user_email, user_message, email_subject)

    elif name == "send_resume":
        user_email = args.get("user_email")
        if not user_email:
            return {"success": False, "message": "Email address is required"}
        return await email_service.send_resume_async(user_email)

    elif name == "open_link":
        url = args.get("url")
        if url:
            await connection_registry.broadcast_to_session(session_id, {"type": "open_link", "url": url})
        return {"success": bool(url), "url": url}

    return {"error": f"Unknown tool: {name}"}
