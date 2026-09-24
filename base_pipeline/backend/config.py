"""
Centralized Configuration & Environment Settings for Pradeep's AI Digital Twin.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"
MODEL_PATH = FRONTEND_DIR / "model" / "tv_man_titan.optimized.glb"
RESUME_PATH = BASE_DIR / "PREADEEP.pdf"

# Load environment files
load_dotenv(BASE_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")

# Google Gemini Live / Voice Settings
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
VOICE_MODEL = os.getenv("MODEL", "gemini-3.1-flash-live-preview")
VOICE_ID = os.getenv("VOICE_ID", "Puck")
SUMMARIZER_MODEL = os.getenv("SUMMARIZER_MODEL", "gemini-2.5-flash")

# Groq / Text Agent Settings
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

# Server Gateway Settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Email / SMTP Settings
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD", "")

# GitHub Settings
GITHUB_PAT = os.getenv("GITHUB_PAT", "")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "Cyberpradeep")
