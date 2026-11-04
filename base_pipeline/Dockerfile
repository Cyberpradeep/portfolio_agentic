FROM python:3.11-slim

# System dependencies for audio synthesis, WebSockets, and build essentials
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    portaudio19-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY app-config.json .

ENV PYTHONSAFEPATH=1
ENV PORT=9000
EXPOSE 9000

CMD ["sh", "-c", "python -m uvicorn backend.app:app --host 0.0.0.0 --port ${X_ZOHO_CATALYST_LISTEN_PORT:-${PORT:-9000}}"]

