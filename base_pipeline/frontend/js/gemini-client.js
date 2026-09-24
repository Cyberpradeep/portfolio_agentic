class GeminiClient {
    constructor({
        onOpen,
        onMessage,
        onClose,
        onError,
        onSessionPaused,
        autoConnect = false,
        autoReconnect = true,
        maxReconnectAttempts = 30
    } = {}) {
        this.websocket = null;
        this.onOpen = onOpen;
        this.onMessage = onMessage;
        this.onClose = onClose;
        this.onError = onError;
        this.onSessionPaused = onSessionPaused;
        this.autoReconnect = autoReconnect;
        this.maxReconnectAttempts = maxReconnectAttempts;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.isExplicitClose = false;
        this.isSessionPaused = false;

        // Session persistence across page reloads & sleep/wake
        this.sessionId = sessionStorage.getItem('portfolio_session_id');
        if (!this.sessionId) {
            this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            sessionStorage.setItem('portfolio_session_id', this.sessionId);
        }

        if (autoConnect) {
            this.connect();
        }
    }

    connect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.websocket && (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.isExplicitClose = false;
        this.isSessionPaused = false;
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/audio?session_id=${encodeURIComponent(this.sessionId)}`;

        try {
            this.websocket = new WebSocket(wsUrl);
            this.websocket.binaryType = "arraybuffer";

            this.websocket.onopen = () => {
                this.reconnectAttempts = 0;
                console.log(`[WS] Successfully connected to live audio pipeline (session_id: ${this.sessionId}).`);
                if (this.onOpen) {
                    this.onOpen();
                }
            };

            this.websocket.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const payload = JSON.parse(event.data);
                        if (payload.type === 'status' && payload.session_id) {
                            this.sessionId = payload.session_id;
                            sessionStorage.setItem('portfolio_session_id', this.sessionId);
                        }
                        if (payload.type === 'session_paused') {
                            console.log('[WS] Session paused due to inactivity standby:', payload);
                            this.isSessionPaused = true;
                            this.isExplicitClose = true; // prevent unintended auto-reconnect loop
                            if (this.onSessionPaused) {
                                this.onSessionPaused(payload);
                            }
                        }
                    } catch (_) {}
                }

                if (this.onMessage) {
                    this.onMessage(event);
                }
            };

            this.websocket.onclose = (event) => {
                const isStandbyClose = event.code === 1000 || (event.reason && event.reason.toLowerCase().includes('standby'));
                if (isStandbyClose) {
                    this.isSessionPaused = true;
                    this.isExplicitClose = true;
                }
                const wasPaused = this.isSessionPaused || isStandbyClose;
                const wasExplicit = this.isExplicitClose;
                this.websocket = null;

                if (this.onClose) {
                    this.onClose(event, { wasPaused });
                }

                // If closed due to intentional pause, standby code 1000, or explicit user stop, do not auto-reconnect
                if (!wasExplicit && !wasPaused && !isStandbyClose && this.autoReconnect) {
                    this.scheduleReconnect();
                }
            };

            this.websocket.onerror = (event) => {
                if (this.onError) {
                    this.onError(event);
                }
            };
        } catch (e) {
            console.warn("[WS] Connection attempt failed:", e);
            if (!this.isExplicitClose && !this.isSessionPaused && this.autoReconnect) {
                this.scheduleReconnect();
            }
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer || this.isSessionPaused || this.isExplicitClose) return;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn("[WS] Max reconnect attempts reached. User interaction required.");
            return;
        }

        const baseDelay = Math.min(1200 * Math.pow(1.5, this.reconnectAttempts), 10000);
        const jitter = Math.random() * 400;
        const delay = Math.round(baseDelay + jitter);
        this.reconnectAttempts++;

        console.log(`[WS] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    sendAudio(data) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        this.websocket.send(data);
    }

    sendTextMessage(text) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ type: "user_text", text: text }));
        } else {
            fetch("/text", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: text, session_id: this.sessionId })
            }).catch(err => console.error("Error sending text query:", err));
        }
    }

    disconnect() {
        this.isExplicitClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
    }

    isConnected() {
        return this.websocket && this.websocket.readyState === WebSocket.OPEN;
    }

    isConnectingOrConnected() {
        return this.websocket && (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING);
    }
}
