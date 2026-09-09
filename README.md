# Conversational 3D Agentic Portfolio | Digital Twin

An interactive portfolio website combining a 3D avatar with a real-time conversational voice assistant and live GitHub activity stream, built using FastAPI, Pipecat AI, Google Gemini Live, and Three.js.

> **Project Status:** Active & Deployed — An autonomous digital twin capable of voice dialogue, generative UI cards, credential projections, and live GitHub commit streaming.

---

## Overview

This project serves as an interactive personal portfolio and digital twin of **Pradeep Selladurai** (AI Engineer & Voice AI Specialist). Rather than browsing a standard static page or PDF resume, visitors can interact via voice or text with an AI assistant that answers questions about projects, technical architectures, skills, work experience, certifications, and live GitHub contributions.

The system pairs a real-time speech-to-speech pipeline with an interactive 3D model whose head display dynamically renders procedural waveforms, status states, and verified credential projections.

---

## Key Features

- **Bi-Directional Voice Dialogue:** Streams 16 kHz raw PCM audio over WebSockets to Google Gemini Live (`gemini-3.1-flash-live-preview`) via Pipecat, supporting natural, sub-800ms spoken conversations.
- **Text Chat Fallback:** Users can type questions at any time; the assistant answers through both visual transcript streaming and speech synthesis.
- **Live GitHub Activity Integration:** Directly integrates with GitHub API to stream real-time push dates, recent commit messages, and open-source contributions with an in-memory 5-minute cache.
- **3D Screen Carousel & Certificate Projection:**
  - **General Certificate Queries:** Initiates an automated 3.8-second rotating carousel of verified certificates directly on the 3D robot's TV screen.
  - **Targeted Credential Queries:** Instantly locks onto and projects a specific certificate (e.g., *Microsoft AI-103: Azure AI Apps and Agents Developer Associate*, *AI-900*, *GitHub Foundations*).
  - Keeps voice speech transcripts off the 3D screen to maintain a clean visual presentation.
- **Function Calling & Dynamic Generative UI:** Gemini Live executes backend functions to fetch data and trigger interactive UI cards:
  - **Featured Projects:** Deep-dives into architectures like *Hospital Voice AI Assistant* and *PizzaBot (Azure AI Foundry Autonomous Agent)*.
  - **Skills Matrix:** Categorized interactive skill cards with 3D physics floating icon spawning.
  - **Career & Achievements:** Experience timeline (Elverve, Edunet Foundation) and competitive hackathon milestones.
  - **Verified Certifications:** Direct credential verification badges and high-res certificate displays.
- **Contact & Resume Tools:** Built-in actions for sending inquiry messages and emailing a PDF copy of Pradeep's resume via SMTP.
- **Deterministic Orchestration Mindset:** Demonstrates Pradeep's engineering thesis: using deterministic Finite State Machines (FSMs) for business workflow transitions and LLMs for semantic extraction and dialogue.

---

## Architecture

```
Visitor (Voice / Text / UI)
       │
       ▼
Frontend (Three.js + Web Audio API + AudioWorklet)
       │
       │ WebSocket (16 kHz PCM Audio / JSON)
       ▼
FastAPI + Pipecat AI Framework
       │
       ├── Multimodal Live Protocol ──► Google Gemini Live API
       │                                     │
       │                                     ├── Audio Responses ──► Browser Playback (Web Audio API)
       │                                     └── Tool Calls ───────► SSE / Events ──► GenUI & 3D TV Screen
       │
       └── GitHub Activity Service ────► GitHub REST API (Live Commits & Pushes, Cached)
```

---

## Tech Stack

### Backend
- **Python 3.11+**
- **FastAPI:** Async web server handling WebSockets, SSE event streaming, and static files.
- **Pipecat AI:** Pipeline orchestration for real-time audio frames, VAD, and Gemini Live integration.
- **Google Gemini Live API (`gemini-3.1-flash-live-preview`):** Low-latency multimodal audio model.
- **HTTPX:** Async HTTP client for live GitHub API synchronization.
- **Uvicorn:** ASGI web server.

### Frontend
- **Vanilla JavaScript & HTML5:** No heavy frameworks to ensure optimal WebGL performance.
- **Three.js:** 3D scene, GLTF model loading, and responsive camera framing.
- **HTML5 Canvas (1024x1024):** Dynamic texture renderer for the 3D avatar's head display.
- **Web Audio API & AudioWorklet:** Client-side 16 kHz audio capture and 24 kHz playback.

---

## Project Structure

```
portfolio_agentic/
├── base_pipeline/
│   ├── backend/
│   │   ├── app.py                 # FastAPI application, Pipecat pipeline, and tool declarations
│   │   ├── session_manager.py     # Session persistence, idle watchdog, and context history
│   │   ├── github_service.py      # Real-time GitHub commit tracker, push sorter, and cache
│   │   ├── PREADEEP.pdf           # Resume file for email dispatch
│   │   └── data/                  # Portfolio knowledge base (JSON format)
│   │       ├── about.json         # Background, philosophy & technical identity
│   │       ├── projects.json      # In-depth project architectures (PizzaBot, Voice AI, etc.)
│   │       ├── skills.json        # Skills matrix, FSM orchestration, frameworks
│   │       ├── experience.json    # Work timeline (Elverve, Edunet Foundation)
│   │       ├── certifications.json# Microsoft AI-103, AI-900, GitHub Foundations, etc.
│   │       ├── achievements.json  # Hackathons, milestones, open source PRs
│   │       └── portfolio_faqs.json# Engineering FAQs & interview deep-dives
│   │
│   ├── frontend/
│   │   ├── index.html             # Application entry point
│   │   ├── favicon.svg / .png     # Custom high-res SVG & PNG favicons
│   │   ├── css/
│   │   │   └── style.css          # Editorial layout and UI styling
│   │   ├── js/
│   │   │   ├── main.js            # UI state, event handling, and card rendering
│   │   │   ├── avatar.js          # Three.js scene setup and camera management
│   │   │   ├── tvScreenManager.js # 3D model screen canvas renderer & certificate slideshow
│   │   │   ├── gemini-client.js   # WebSocket transport for audio streaming
│   │   │   ├── media-handler.js   # Microphone input and speaker output
│   │   │   └── pcm-processor.js   # AudioWorklet downsampler (48 kHz to 16 kHz)
│   │   ├── assests/               # High-res verified certificate images
│   │   └── model/                 # 3D robot GLTF asset
│   │
│   └── requirements.txt           # Python backend dependencies
├── Procfile                       # Cloud deployment entry point
├── render.yaml                    # Render deployment configuration
└── README.md                      # Project documentation
```

---

## Getting Started

### 1. Prerequisites
- Python 3.11 or higher
- A Google Gemini API Key with access to the Gemini Live multimodal API
- (Optional) A GitHub Personal Access Token for extended GitHub API limits

### 2. Setup

Clone the repository and create a virtual environment:

```bash
git clone https://github.com/Cyberpradeep/portfolio_agentic.git
cd portfolio_agentic

# Create and activate virtual environment
python -m venv base_pipeline/.venv

# Windows
base_pipeline\.venv\Scripts\activate

# Linux / macOS
source base_pipeline/.venv/bin/activate

# Install dependencies
pip install -r base_pipeline/requirements.txt
```

### 3. Environment Variables

Create a `.env` file inside `base_pipeline/backend/` or the root directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
MODEL=gemini-3.1-flash-live-preview
VOICE_ID=Puck
HOST=0.0.0.0
PORT=8000

# Optional: GitHub API Token (boosts rate limit from 60 to 5,000 requests/hr)
GITHUB_TOKEN=your_github_token_here

# Optional: Email dispatch configuration
SENDER_EMAIL=your_email@gmail.com
SENDER_PASSWORD=your_email_app_password
```

### 4. Running the Application

Start the FastAPI server:

```bash
cd base_pipeline/backend
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Visit `http://localhost:8000` in a modern browser (Chrome, Edge, Brave, or Firefox).

---

## Featured Project Highlights

- **Hospital Voice AI Assistant:** Real-time appointment booking via voice (Gemini Live, Pipecat, Exotel telephony, context slicing, sub-800ms latency).
- **PizzaBot (Azure AI Foundry Autonomous Agent):** Autonomous conversational ordering agent built with Azure AI Foundry Agent Service, Model Context Protocol (MCP), vector RAG, multi-store timezone awareness, and bounded deterministic state control.
- **English Tutor Companion:** Multilingual speaking companion with CEFR assessment and 3D VRM lip-sync.
- **Agentic 3D Portfolio Digital Twin:** This live system combining speech-to-speech, Three.js spatial computing, GenUI, and live GitHub commit feeds.

---

## License

This project is licensed under the [MIT License](LICENSE).

