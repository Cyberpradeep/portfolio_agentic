"""
Voice AI Tools & Schema Declarations for Gemini Live.
Registers Google GenAI function declarations and binds session-scoped callbacks.
"""

from typing import List
from google.genai import types
from pipecat.services.llm_service import FunctionCallParams

from core.connection_registry import connection_registry
from core.services import data_service, email_service, github_service


# --------------------------------------------------------------------------
# 1. Gemini Function Declarations (Tools Schema)
# --------------------------------------------------------------------------
GEMINI_VOICE_TOOLS = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="get_about",
            description="Get information about Pradeep Selladurai including education, career journey, interests, goals, and professional identity.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            )
        ),
        types.FunctionDeclaration(
            name="get_projects",
            description="Get complete list of all Pradeep's projects, technologies, and summaries. Automatically displays the interactive project slate on screen.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            )
        ),
        types.FunctionDeclaration(
            name="get_project_details",
            description="Get complete details about a specific project including technologies, architecture, features, challenges, solutions, and GitHub links. Automatically displays the detailed project card on screen.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "project_name": types.Schema(
                        type=types.Type.STRING,
                        description="The name of the project (e.g., 'Hospital Voice AI Assistant', 'English Tutor Companion', 'GenAI Coach', 'PizzaBot')"
                    )
                },
                required=["project_name"]
            )
        ),
        types.FunctionDeclaration(
            name="get_best_project",
            description="Recommends Pradeep's flagship project and explains why it represents his engineering strengths.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            )
        ),
        types.FunctionDeclaration(
            name="get_skills",
            description="Get complete skills and technologies information. Automatically displays the 4-quadrant technical taxonomy matrix on screen.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            )
        ),
        types.FunctionDeclaration(
            name="get_experience",
            description="Get work history, internships, and career timeline. Automatically displays the interactive milestone chronology on screen.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            )
        ),
        types.FunctionDeclaration(
            name="get_certifications",
            description="Get verified certifications. Projects certificate images directly onto the 3D robot TV screen.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "certification_name": types.Schema(
                        type=types.Type.STRING,
                        description="(Optional) Specific certificate name, code, or keyword (e.g. 'Azure AI Apps and Agents', 'AI-103', 'AI-900', 'GitHub Foundations')."
                    )
                },
            )
        ),
        types.FunctionDeclaration(
            name="get_achievements",
            description="Get hackathons, conferences, milestones, and awards.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            )
        ),
        types.FunctionDeclaration(
            name="search_faq",
            description="Search answers to frequently asked engineering, personal, or interview questions.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="The question or topic to search for"
                    )
                },
                required=["query"]
            )
        ),
        types.FunctionDeclaration(
            name="send_contact_email",
            description="Send an email with the visitor's contact information and inquiry directly to Pradeep.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "user_email": types.Schema(type=types.Type.STRING, description="The user's email address"),
                    "user_message": types.Schema(type=types.Type.STRING, description="The message from the user"),
                    "email_subject": types.Schema(type=types.Type.STRING, description="A short subject line (2-5 words)")
                },
                required=["user_email", "user_message", "email_subject"]
            )
        ),
        types.FunctionDeclaration(
            name="send_resume",
            description="Sends Pradeep's resume PDF directly to the specified email address.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "user_email": types.Schema(type=types.Type.STRING, description="The user's email address")
                },
                required=["user_email"]
            )
        ),
        types.FunctionDeclaration(
            name="open_link",
            description="Dynamically opens an external URL on the user's screen.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "url": types.Schema(type=types.Type.STRING, description="The URL to open")
                },
                required=["url"]
            )
        ),
        types.FunctionDeclaration(
            name="show_skills",
            description="Displays the visual skills matrix on screen. Call whenever mentioning programming languages or frameworks.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "skills": types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(type=types.Type.STRING),
                        description="List of skills to highlight"
                    )
                },
                required=["skills"]
            )
        ),
        types.FunctionDeclaration(
            name="show_projects",
            description="Displays the interactive project specimen cards on screen.",
            parameters=types.Schema(type=types.Type.OBJECT, properties={})
        ),
        types.FunctionDeclaration(
            name="show_experience",
            description="Displays the career timeline on screen.",
            parameters=types.Schema(type=types.Type.OBJECT, properties={})
        ),
        types.FunctionDeclaration(
            name="show_certifications",
            description="Displays certifications on screen and projects certificate image on the 3D monitor.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "certification_name": types.Schema(
                        type=types.Type.STRING,
                        description="(Optional) Specific certificate name or code"
                    )
                }
            )
        ),
        types.FunctionDeclaration(
            name="get_github_activity",
            description="Fetches live real-time GitHub commits, push events, and open-source contributions.",
            parameters=types.Schema(type=types.Type.OBJECT, properties={})
        ),
    ])
]


# --------------------------------------------------------------------------
# 2. Session-Scoped Tool Registration
# --------------------------------------------------------------------------
def register_voice_tools(llm, session_id: str):
    """
    Binds tool callback handlers to the session's Gemini Live instance.
    All broadcast events are strictly scoped to session_id.
    """

    async def get_about(p: FunctionCallParams):
        result = data_service.get_about_data()
        await p.result_callback(result)

    async def get_projects(p: FunctionCallParams):
        data = data_service.get_projects_data()
        recent_pushed = []
        try:
            pushed_info = await github_service.get_recent_pushed_repos(limit=5)
            if pushed_info.get("success"):
                recent_pushed = pushed_info.get("repos", [])
        except Exception as exc:
            print(f"[VOICE_PROJECTS_ERR] {exc}")

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

        await p.result_callback({
            "total_projects": len(data.get("projects", [])),
            "freshest_active_repos_on_github": recent_pushed,
            "projects": [
                {
                    "id": pr["id"],
                    "name": pr["name"],
                    "type": pr["type"],
                    "summary": pr["summary"],
                    "github_url": pr.get("github_url", "")
                }
                for pr in data.get("projects", [])
            ]
        })

    async def get_project_details(p: FunctionCallParams):
        project_name = p.arguments.get("project_name", "").strip()
        matched = data_service.find_project(project_name)

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
                    print(f"[VOICE_COMMIT_ERR] {exc}")

            await connection_registry.broadcast_to_session(session_id, {
                "type": "show_project",
                "project": project_copy
            })
            await p.result_callback({"found": True, "project": project_copy})
            return

        # Fallback to GitHub repo
        try:
            commit_info = await github_service.get_repo_recent_commits(project_name, limit=3)
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
                await p.result_callback({"found": True, "project": adhoc})
                return
        except Exception as exc:
            print(f"[VOICE_ADHOC_ERR] {exc}")

        projects = data_service.get_projects_data().get("projects", [])
        available = [pr["name"] for pr in projects]
        await p.result_callback({
            "found": False,
            "message": f"Project not found. Available projects: {', '.join(available)}"
        })

    async def get_best_project(p: FunctionCallParams):
        await p.result_callback({
            "recommended_project": "Hospital Voice AI Assistant",
            "reason": [
                "Voice AI",
                "Agentic AI",
                "Context Engineering",
                "Function Calling",
                "Telephony Integration",
                "Client Project Experience"
            ]
        })

    async def get_skills(p: FunctionCallParams):
        result = data_service.get_skills_data()
        quadrants = [
            {"title": "Languages & Backend", "items": ["Python", "FastAPI", "Flask", "Java", "WebSockets", "MySQL", "MongoDB"]},
            {"title": "Frontend & Tools", "items": ["React", "JavaScript", "HTML", "CSS", "ThreeJS", "Docker", "Git"]},
            {"title": "AI & Agentic Systems", "items": ["Agentic AI", "Voice AI", "Gemini Live", "CrewAI", "Pipecat", "RAG", "Tool Calling"]},
            {"title": "Concepts & Cloud", "items": ["Context Engineering", "Prompt Engineering", "Azure", "Railway", "HuggingFace"]}
        ]
        await connection_registry.broadcast_to_session(session_id, {
            "type": "show_skills",
            "skills": [],
            "quadrants": quadrants
        })
        await p.result_callback(result)

    async def get_experience(p: FunctionCallParams):
        result = data_service.get_experience_data()
        await connection_registry.broadcast_to_session(session_id, {
            "type": "show_experience",
            "experience": result
        })
        await p.result_callback(result)

    async def get_certifications(p: FunctionCallParams):
        result = data_service.get_certifications_data()
        cert_query = p.arguments.get("certification_name", "") if p.arguments else ""
        matched = data_service.resolve_certification(cert_query) if cert_query else None

        if matched:
            await connection_registry.broadcast_to_session(session_id, {
                "type": "show_certifications",
                "certifications": [matched],
                "active_image": matched.get("image") or "/static/assests/azure_ai_apps_and_agents_associate.png",
                "title": matched.get("name"),
                "single_cert": True
            })
            await p.result_callback({
                "certification": matched,
                "displaying_on_tv": matched.get("image") is not None,
                "image": matched.get("image"),
                "verify_url": matched.get("verify_url"),
                "message": f"Displaying {matched['name']} on the robot TV screen."
            })
            return

        completed = result.get("completed_certifications", [])
        cert_images = [
            {"url": c["image"], "title": c["name"], "code": c.get("code", "")}
            for c in completed if c.get("image")
        ]

        await connection_registry.broadcast_to_session(session_id, {
            "type": "show_certifications",
            "certifications": completed[:4],
            "active_image": cert_images[0]["url"] if cert_images else "/static/assests/azure_ai_apps_and_agents_associate.png",
            "title": cert_images[0]["title"] if cert_images else "Microsoft Certified: Azure AI Apps and Agents Developer Associate",
            "single_cert": False,
            "images": cert_images
        })
        await p.result_callback(result)

    async def get_achievements(p: FunctionCallParams):
        result = data_service.get_achievements_data()
        await p.result_callback(result)

    async def search_faq(p: FunctionCallParams):
        query = p.arguments.get("query", "")
        results = data_service.search_faqs(query)
        await p.result_callback({"count": len(results), "results": results})

    async def send_contact_email(p: FunctionCallParams):
        user_email = p.arguments.get("user_email")
        user_message = p.arguments.get("user_message")
        email_subject = p.arguments.get("email_subject")
        res = await email_service.send_contact_email_async(user_email, user_message, email_subject)
        await p.result_callback(res)

    async def send_resume(p: FunctionCallParams):
        user_email = p.arguments.get("user_email")
        if not user_email:
            await p.result_callback({"success": False, "message": "User email is missing"})
            return
        res = await email_service.send_resume_async(user_email)
        await p.result_callback(res)

    async def open_link(p: FunctionCallParams):
        url = p.arguments.get("url")
        if url:
            await connection_registry.broadcast_to_session(session_id, {"type": "open_link", "url": url})
            await p.result_callback({"success": True, "message": f"Opened link: {url}"})
        else:
            await p.result_callback({"success": False, "message": "No URL provided."})

    async def show_skills(p: FunctionCallParams):
        skills = p.arguments.get("skills", [])
        quadrants = [
            {"title": "Languages & Backend", "items": ["Python", "FastAPI", "Flask", "Java", "WebSockets", "MySQL", "MongoDB"]},
            {"title": "Frontend & Tools", "items": ["React", "JavaScript", "HTML", "CSS", "ThreeJS", "Docker", "Git"]},
            {"title": "AI & Agentic Systems", "items": ["Agentic AI", "Voice AI", "Gemini Live", "CrewAI", "Pipecat", "RAG", "Tool Calling"]},
            {"title": "Concepts & Cloud", "items": ["Context Engineering", "Prompt Engineering", "Azure", "Railway", "HuggingFace"]}
        ]
        await connection_registry.broadcast_to_session(session_id, {
            "type": "show_skills",
            "skills": skills,
            "quadrants": quadrants
        })
        await p.result_callback({"success": True, "skills": skills})

    async def show_projects(p: FunctionCallParams):
        await get_projects(p)

    async def show_experience(p: FunctionCallParams):
        await get_experience(p)

    async def show_certifications(p: FunctionCallParams):
        await get_certifications(p)

    async def get_github_activity(p: FunctionCallParams):
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
            await p.result_callback({"success": True, **payload})
        except Exception as exc:
            await p.result_callback({"success": False, "error": str(exc)})

    # Register each function with the Gemini Live service
    llm.register_function("get_about", get_about)
    llm.register_function("get_projects", get_projects)
    llm.register_function("get_project", get_project_details)
    llm.register_function("get_project_details", get_project_details)
    llm.register_function("get_best_project", get_best_project)
    llm.register_function("get_skills", get_skills)
    llm.register_function("get_experience", get_experience)
    llm.register_function("get_certifications", get_certifications)
    llm.register_function("get_achievements", get_achievements)
    llm.register_function("search_faq", search_faq)
    llm.register_function("send_contact_email", send_contact_email)
    llm.register_function("send_resume", send_resume)
    llm.register_function("open_link", open_link)
    llm.register_function("show_skills", show_skills)
    llm.register_function("show_projects", show_projects)
    llm.register_function("show_experience", show_experience)
    llm.register_function("show_certifications", show_certifications)
    llm.register_function("get_github_activity", get_github_activity)
