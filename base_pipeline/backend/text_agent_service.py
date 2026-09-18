import asyncio
import json
import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from dotenv import load_dotenv
from openai import AsyncOpenAI

# Determine directories
BASE_DIR = Path(__file__).resolve().parent
ROOT = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"

load_dotenv(BASE_DIR / ".env")
load_dotenv(ROOT / ".env")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Import github_service if available
try:
    import github_service
except ImportError:
    try:
        from . import github_service
    except Exception:
        github_service = None

# Initialize AsyncOpenAI client targeting Groq
client = AsyncOpenAI(
    base_url=GROQ_BASE_URL,
    api_key=GROQ_API_KEY or "dummy_key_for_init",
)

SYSTEM_PROMPT = """You are Pradeep Selladurai's AI Digital Twin and portfolio copilot.
Your mission is to converse with visitors about Pradeep's engineering projects, architectural philosophy, certifications, and technical skills.

ENGINEERING PHILOSOPHY & BACKGROUND:
- Specialization: Applied Voice AI (speech-to-speech pipelines, WebSockets, sub-800ms turnaround, Cartesia, Gemini Live), Agentic AI (Azure AI Foundry, MCP, LangGraph, tool calling), and Context Engineering.
- Architectural Thesis: Deterministic finite state machines (FSMs) and constrained graph workflows over raw, unconstrained LLM autonomy. LLMs handle intent extraction and tools; deterministic state machines guard state transitions.
- Current Role: Voice AI & Agentic AI engineer at Elverve.

STYLE RULES:
- Tone: Technical, confident, friendly, and conversational.
- Length: Keep responses concise and focused (under 60 words for text mode).
- Formatting: Clean plain text with standard markdown links where appropriate.
- ZERO EMOJIS: Never use emojis anywhere in your responses.

TOOL CALLING GUIDELINES:
- When a user asks to see, show, explore, or list projects -> Call `show_projects`.
- When a user asks about a specific project (e.g. Hospital Voice AI, PizzaBot, English Tutor) -> Call `get_project_details`.
- When a user asks about certifications or credentials (e.g. Azure AI, GitHub, AI-103) -> Call `show_certifications`.
- When a user asks about programming skills, tech stack, or frameworks -> Call `show_skills`.
- When a user asks about work experience, internships, or career background -> Call `show_experience`.
- When a user asks about real-time GitHub activity, recent commits, or open-source PRs -> Call `get_github_activity`.
- When a user wants to send an email, message, or contact Pradeep -> Call `send_contact_email`.
- When a user asks to receive or download Pradeep's resume -> Call `send_resume`.
- When a user asks to open LinkedIn, GitHub, or an external link -> Call `open_link`.
"""

TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "show_projects",
            "description": "Displays all of Pradeep's featured projects as interactive GenUI cards on the user's screen. Call this when the user asks to see, list, or explore projects.",
            "parameters": {
                "type": "object",
                "properties": {},
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_project_details",
            "description": "Fetches deep architectural details, metrics, and latest GitHub commits for a specific project. Call this when the user inquires about a specific project.",
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
            "parameters": {
                "type": "object",
                "properties": {}
            }
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
            "name": "get_github_activity",
            "description": "Fetches Pradeep's live real-time GitHub activity, recent repository commits, push events, and open-source contributions.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
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

# In-memory multi-turn session store: session_id -> list of message dicts
_session_memories: Dict[str, List[Dict[str, Any]]] = {}
MAX_SESSION_TURNS = 12


def _load_json(filename: str) -> dict:
    file_path = DATA_DIR / filename
    if not file_path.exists():
        return {}
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _resolve_certification(query: str, certs_data: dict) -> Optional[dict]:
    if not query or not str(query).strip():
        return None
    q = str(query).strip().lower()
    completed = certs_data.get("completed_certifications", [])

    if any(k in q for k in ["104", "103", "102", "associate", "agent", "apps and agent", "ai app", "azure ai agent"]):
        for c in completed:
            c_name = c.get("name", "").lower()
            if "apps and agents" in c_name or "ai-10" in c.get("code", "").lower() or "ai-10" in c_name:
                return c

    if any(k in q for k in ["900", "fundamental", "azure ai fundamental", "ai-900"]):
        for c in completed:
            if "fundamentals" in c.get("name", "").lower() and "azure" in c.get("name", "").lower():
                return c

    if any(k in q for k in ["github", "gh-900", "git"]):
        for c in completed:
            if "github" in c.get("name", "").lower():
                return c

    if "distributed" in q:
        for c in completed:
            if "distributed" in c.get("name", "").lower():
                return c

    if "edge" in q:
        for c in completed:
            if "edge" in c.get("name", "").lower():
                return c

    for c in completed:
        if q in c.get("name", "").lower() or c.get("name", "").lower() in q:
            return c

    return None


# --------------------------------------------------------------------------
# Tool Execution Handlers
# --------------------------------------------------------------------------
async def _execute_tool(name: str, args: dict, broadcast_func: Optional[Callable]) -> dict:
    print(f"[TEXT_AGENT_TOOL] executing {name} with args={args}")

    if name == "show_projects":
        data = _load_json("projects.json")
        projects = data.get("projects", [])
        cards = []
        for proj in projects:
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

        if broadcast_func:
            await broadcast_func({"type": "show_projects", "projects": cards})

        return {
            "success": True,
            "total_projects": len(projects),
            "featured_names": [p["name"] for p in projects[:4]]
        }

    elif name == "get_project_details":
        project_name = args.get("project_name", "").strip()
        data = _load_json("projects.json")
        projects = data.get("projects", [])
        matched = None

        for p in projects:
            aliases = p.get("aliases", [])
            if (
                project_name.lower() in p["name"].lower()
                or project_name.lower() in p.get("id", "").lower()
                or any(project_name.lower() in str(a).lower() for a in aliases)
            ):
                matched = p
                break

        if not matched:
            query_words = set(project_name.lower().split())
            for p in projects:
                proj_words = set(p["name"].lower().split() + p.get("id", "").lower().split())
                if len(query_words.intersection(proj_words)) >= 2:
                    matched = p
                    break

        if matched:
            project_copy = dict(matched)
            if github_service and matched.get("github_url"):
                try:
                    commit_info = await github_service.get_repo_recent_commits(matched["github_url"], limit=3)
                    if commit_info.get("success"):
                        project_copy["recent_git_activity"] = {
                            "latest_commit_date": commit_info.get("latest_commit_date"),
                            "latest_commit_message": commit_info.get("latest_commit_message"),
                            "recent_commits": commit_info.get("commits", [])
                        }
                except Exception as exc:
                    print(f"[TEXT_AGENT_GIT_ERR] {exc}")

            if broadcast_func:
                await broadcast_func({"type": "show_project", "project": project_copy})

            return {"found": True, "project": project_copy}

        return {
            "found": False,
            "message": f"Project '{project_name}' not found. Available: {', '.join(p['name'] for p in projects[:5])}"
        }

    elif name == "show_skills":
        skills_arg = args.get("skills", [])
        quadrants = [
            {
                "title": "Languages & Backend",
                "items": ["Python", "FastAPI", "Flask", "Java", "WebSockets", "MySQL", "MongoDB"]
            },
            {
                "title": "Frontend & Tools",
                "items": ["React", "JavaScript", "HTML", "CSS", "ThreeJS", "Docker", "Git"]
            },
            {
                "title": "AI & Agentic Systems",
                "items": ["Agentic AI", "Voice AI", "Gemini Live", "CrewAI", "Pipecat", "RAG", "Tool Calling"]
            },
            {
                "title": "Concepts & Cloud",
                "items": ["Context Engineering", "Prompt Engineering", "Azure", "Railway", "HuggingFace"]
            }
        ]
        if broadcast_func:
            await broadcast_func({"type": "show_skills", "skills": skills_arg, "quadrants": quadrants})

        return {"success": True, "categories": [q["title"] for q in quadrants]}

    elif name == "show_experience":
        data = _load_json("experience.json")
        if broadcast_func:
            await broadcast_func({"type": "show_experience", "experience": data})

        return {"success": True, "experience": data}

    elif name == "show_certifications":
        cert_query = args.get("certification_name", "")
        data = _load_json("certifications.json")
        matched = _resolve_certification(cert_query, data) if cert_query else None

        if matched:
            payload = {
                "type": "show_certifications",
                "certifications": [matched],
                "active_image": matched.get("image") or "/static/assests/azure_ai_apps_and_agents_associate.png",
                "title": matched.get("name"),
                "single_cert": True
            }
            if broadcast_func:
                await broadcast_func(payload)
            return {"matched": True, "certification": matched["name"], "image": matched.get("image")}

        # General list
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
        if broadcast_func:
            await broadcast_func(payload)

        return {"matched": False, "count": len(completed), "certifications": [c["name"] for c in completed]}

    elif name == "get_github_activity":
        if github_service:
            try:
                activity = await github_service.get_user_recent_activity(limit=25)
                pushed_repos = await github_service.get_recent_pushed_repos(limit=6)
                payload = {
                    "type": "show_github_activity",
                    "recent_pushes": activity.get("recent_pushes", []),
                    "open_source_contributions": activity.get("open_source_contributions", []),
                    "latest_repos": pushed_repos.get("repos", [])
                }
                if broadcast_func:
                    await broadcast_func(payload)
                return {
                    "success": True,
                    "recent_pushes_count": len(activity.get("recent_pushes", [])),
                    "latest_repos": [r["name"] for r in pushed_repos.get("repos", [])[:3]]
                }
            except Exception as exc:
                return {"success": False, "error": str(exc)}
        return {"success": False, "message": "GitHub service unavailable"}

    elif name == "send_contact_email":
        user_email = args.get("user_email")
        user_message = args.get("user_message")
        email_subject = args.get("email_subject")
        sender_email = os.getenv("SENDER_EMAIL")
        sender_password = os.getenv("SENDER_PASSWORD")

        if not sender_email or not sender_password:
            return {"success": False, "message": "SMTP email configuration missing in environment"}

        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['Reply-To'] = user_email
        msg['To'] = sender_email
        msg['Subject'] = f"[Portfolio Contact] {email_subject}"
        msg.attach(MIMEText(f"From: {user_email}\nSubject: {email_subject}\n\n{user_message}", "plain"))

        try:
            with smtplib.SMTP('smtp.gmail.com', 587) as server:
                server.starttls()
                server.login(sender_email, sender_password)
                server.send_message(msg)
            return {"success": True, "message": "Email sent successfully"}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    elif name == "send_resume":
        user_email = args.get("user_email")
        sender_email = os.getenv("SENDER_EMAIL", "pradeepnaveen930@gmail.com")
        sender_password = os.getenv("SENDER_PASSWORD", "")
        resume_path = BASE_DIR / "PREADEEP.pdf"

        if not resume_path.exists():
            return {"success": False, "message": "Resume PDF file not found on server"}

        msg = MIMEMultipart()
        msg["From"] = sender_email
        msg["To"] = user_email
        msg["Subject"] = "Pradeep Selladurai - Resume"
        msg.attach(MIMEText("Hello,\n\nPlease find attached my resume for your review.\n\nThank you,\nPradeep Selladurai", "plain"))

        try:
            with open(resume_path, "rb") as f:
                attachment = MIMEApplication(f.read(), _subtype="pdf")
            attachment.add_header("Content-Disposition", "attachment", filename=resume_path.name)
            msg.attach(attachment)

            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls()
                server.login(sender_email, sender_password)
                server.send_message(msg)
            return {"success": True, "message": f"Resume dispatched to {user_email}"}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    elif name == "open_link":
        url = args.get("url")
        if url and broadcast_func:
            await broadcast_func({"type": "open_link", "url": url})
        return {"success": bool(url), "url": url}

    return {"error": f"Unknown tool: {name}"}


# --------------------------------------------------------------------------
# Main Text Query Entry Point
# --------------------------------------------------------------------------
async def handle_text_query(
    text: str,
    session_id: Optional[str] = None,
    broadcast_func: Optional[Callable] = None
) -> Dict[str, Any]:
    """
    Executes a typed user query through Groq's qwen/qwen3.8-27b model,
    automatically resolving function calls, broadcasting GenUI events,
    and returning the final assistant response.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        return {"response": "Please provide a query.", "tools_called": []}

    sess_key = session_id or "default_session"
    if sess_key not in _session_memories:
        _session_memories[sess_key] = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

    history = _session_memories[sess_key]
    history.append({"role": "user", "content": clean_text})

    # Keep memory within maximum bounds
    if len(history) > (MAX_SESSION_TURNS * 2) + 1:
        # Preserve system prompt at [0], slice older turns
        _session_memories[sess_key] = [history[0]] + history[-(MAX_SESSION_TURNS * 2):]
        history = _session_memories[sess_key]

    tools_called: List[str] = []
    final_response = ""

    try:
        # Step 1: Initial call to Groq
        response = await client.chat.completions.create(
            model=GROQ_MODEL,
            messages=history,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.35,
            max_tokens=320,
        )

        message = response.choices[0].message
        tool_calls = getattr(message, "tool_calls", None)

        if tool_calls:
            # Append assistant's tool_calls intention to history (clean format for Groq)
            clean_tool_calls = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    }
                }
                for tc in tool_calls
            ]
            history.append({
                "role": "assistant",
                "content": message.content or None,
                "tool_calls": clean_tool_calls,
            })

            # Step 2: Execute each tool call
            for t_call in tool_calls:
                func_name = t_call.function.name
                tools_called.append(func_name)
                try:
                    args = json.loads(t_call.function.arguments)
                except Exception:
                    args = {}

                tool_result = await _execute_tool(func_name, args, broadcast_func)

                history.append({
                    "role": "tool",
                    "tool_call_id": t_call.id,
                    "content": json.dumps(tool_result)
                })

            # Step 3: Follow-up call for natural language synthesis
            follow_up = await client.chat.completions.create(
                model=GROQ_MODEL,
                messages=history,
                temperature=0.35,
                max_tokens=280,
            )
            final_response = follow_up.choices[0].message.content or ""
        else:
            final_response = message.content or ""

        # Strip any accidental emojis or unwanted artifacts
        final_response = final_response.strip()

        # Append final assistant message to memory
        history.append({"role": "assistant", "content": final_response})

        # Step 4: Broadcast to active SSE clients so UI state updates immediately
        if broadcast_func:
            await broadcast_func({
                "type": "assistant",
                "text": final_response
            })
            await broadcast_func({
                "type": "turn_complete"
            })

        return {
            "response": final_response,
            "tools_called": tools_called,
            "session_id": sess_key
        }

    except Exception as exc:
        print(f"[TEXT_AGENT_ERROR] {exc}")
        err_msg = "I encountered an issue processing that query. Please try again or engage the voice session."
        if broadcast_func:
            await broadcast_func({"type": "assistant", "text": err_msg})
            await broadcast_func({"type": "turn_complete"})
        return {
            "response": err_msg,
            "tools_called": tools_called,
            "error": str(exc),
            "session_id": sess_key
        }
