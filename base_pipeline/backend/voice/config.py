"""
Voice AI Configuration & Audio Pipeline Settings.
"""

from config import GEMINI_API_KEY, VOICE_MODEL, VOICE_ID, SUMMARIZER_MODEL

SAMPLE_RATE_IN = 16000
SAMPLE_RATE_OUT = 24000
VAD_SILENCE_DURATION_MS = 500
INACTIVITY_TIMEOUT_SECONDS = 60

# Check for RNNoise neural noise suppression availability
try:
    from pipecat.audio.filters.rnnoise_filter import RNNoiseFilter
    RNNOISE_AVAILABLE = True
except Exception as _exc:
    print(f"[RNNOISE] Notice: RNNoiseFilter not available: {_exc}")
    RNNoiseFilter = None
    RNNOISE_AVAILABLE = False
