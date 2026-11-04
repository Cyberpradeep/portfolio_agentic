import os
import sys

# Ensure backend directory is in python module search path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

import uvicorn

if __name__ == "__main__":
    port_str = os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT") or os.environ.get("PORT") or "9000"
    try:
        port = int(port_str)
    except ValueError:
        port = 9000

    print(f"[APPSAIL] Starting Uvicorn on 0.0.0.0:{port}...")
    uvicorn.run("backend.app:app", host="0.0.0.0", port=port, log_level="info")

