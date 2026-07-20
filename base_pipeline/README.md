# Base Pipeline (Pipecat + Gemini Live)

This milestone implements the conversation skeleton only:
- Text + audio conversation
- Pipecat + Gemini Live backend
- Manga/comic style UI shell
- GLB avatar with state transitions (idle, listening, thinking, speaking)

## Run

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Create `.env` from `.env.example` and set `GEMINI_API_KEY`.
4. Start the server:

```bash
python backend/app.py
```

5. Open `http://127.0.0.1:8000`.

## Notes

- This build is intentionally tool-call free.
- Text messages use `POST /text` to inject `InputTextRawFrame` into the active Pipecat task.
- Voice capture streams raw PCM to `WebSocket /audio`.
