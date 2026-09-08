# Conversational 3D Portfolio

An interactive portfolio website combining a 3D avatar with a real-time conversational voice assistant, built using FastAPI, Pipecat AI, Google Gemini Live, and Three.js.

> **Project Status:** Active Development — I am currently working on this project, refining the real-time audio pipeline, 3D interaction, and tool integrations.

---

## Overview

This project serves as an interactive personal portfolio. Rather than browsing a standard static page or PDF resume, visitors can interact via voice or text with an AI assistant that answers questions about projects, technical skills, work experience, and certifications.

The system pairs a real-time speech-to-speech engine with an interactive 3D model whose head display renders procedural waveforms, status states, and credential documents.

---

## Key Features

- **Bi-Directional Voice Dialogue:** Streams 16 kHz raw PCM audio over WebSockets to Google Gemini Live via Pipecat, supporting natural, low-latency spoken conversations.
- **Text Chat Fallback:** Users can type questions at any time; the assistant answers through both visual transcript streaming and voice synthesis.
- **Function Calling & Dynamic UI:** Gemini Live calls backend functions to fetch data and trigger structured UI cards for:
  - Featured projects and technical architectures
  - Categorized skill matrices
  - Career chronology and milestones
  - Verified certifications with direct credential verification links
- **3D Head Display Projection:** When a visitor asks about certifications, the assistant projects the relevant certificate image onto the 3D model's screen and adjusts the camera focus.
- **Contact & Resume Tools:** Built-in actions for sending inquiry emails and emailing a PDF copy of the resume via SMTP.
- **Session & State Management:** Includes on-demand microphone engagement, automatic session pause after 60 seconds of inactivity, and background context summarization to maintain low latency.

---

## Architecture

```
Visitor (Voice / Text)
       │
       ▼
Frontend (Three.js + Web Audio API + AudioWorklet)
       │
       │ WebSocket (16 kHz PCM Audio / JSON)
       ▼
FastAPI + Pipecat AI Framework
       │
       │ Multimodal Live Protocol
       ▼
Google Gemini Live API
       │
       ├── Audio Responses ──► Browser Playback (Web Audio API)
       └── Tool Calls ───────► SSE / Events ──► Dynamic UI & 3D Screen Projection
```

---

## Tech Stack

### Backend
- **Python 3.11+**
- **FastAPI:** Async web server handling WebSockets, SSE event streaming, and static files.
- **Pipecat AI:** Pipeline orchestration for real-time audio frames, VAD, and Gemini Live integration.
- **Google Gemini Live API:** Low-latency multimodal audio model.
- **Uvicorn:** ASGI web server.

### Frontend
- **Vanilla JavaScript & HTML5:** No heavy frameworks to ensure optimal WebGL performance.
- **Three.js:** 3D scene, GLTF model loading, and lighting.
- **HTML5 Canvas:** 1024x1024 dynamic canvas used as a texture for the 3D avatar's screen.
- **Web Audio API & AudioWorklet:** Client-side 16 kHz audio capture and 24 kHz playback.

---

## Project Structure

```
portfolio_agentic/
├── base_pipeline/
│   ├── backend/
│   │   ├── app.py                 # FastAPI application, Pipecat pipeline, and tool declarations
│   │   ├── session_manager.py     # Session persistence, idle watchdog, and context history
│   │   ├── PREADEEP.pdf           # Resume file for email dispatch
│   │   └── data/                  # Portfolio knowledge base (JSON format)
│   │       ├── about.json
│   │       ├── projects.json
│   │       ├── skills.json
│   │       ├── experience.json
│   │       ├── certifications.json
│   │       └── portfolio_faqs.json
│   │
│   ├── frontend/
│   │   ├── index.html             # Application entry point
│   │   ├── css/
│   │   │   └── style.css          # Editorial layout and UI styling
│   │   ├── js/
│   │   │   ├── main.js            # UI state, event handling, and card rendering
│   │   │   ├── avatar.js          # Three.js scene setup and camera management
│   │   │   ├── tvScreenManager.js # 3D model screen canvas renderer
│   │   │   ├── gemini-client.js   # WebSocket transport for audio streaming
│   │   │   ├── media-handler.js   # Microphone input and speaker output
│   │   │   └── pcm-processor.js   # AudioWorklet downsampler (48 kHz to 16 kHz)
│   │   ├── assests/               # Certificate images and static assets
│   │   └── model/                 # 3D GLTF asset
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

Visit `http://localhost:8000` in a supported browser (Chrome, Edge, or Firefox).

---

## Current Work & Roadmap

I am actively developing this portfolio. Ongoing areas of work include:

- Expanding multi-certificate image support on the 3D screen.
- Reducing initial cold-start latency for Gemini Live WebSocket handshakes.
- Improving mobile viewport layouts and touch camera interactions.
- Adding deeper project architecture deep-dives triggered via voice queries.

---

## License

This project is licensed under the [MIT License](LICENSE).
