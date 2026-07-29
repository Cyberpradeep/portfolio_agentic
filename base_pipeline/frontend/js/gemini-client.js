class GeminiClient {
    constructor({ onOpen, onMessage, onClose, onError }) {
        this.websocket = null;
        this.onOpen = onOpen;
        this.onMessage = onMessage;
        this.onClose = onClose;
        this.onError = onError;
    }

    connect() {
        if (this.websocket && (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/audio`;

        this.websocket = new WebSocket(wsUrl);
        this.websocket.binaryType = "arraybuffer";

        this.websocket.onopen = () => {
            if (this.onOpen) {
                this.onOpen();
            }
        };

        this.websocket.onmessage = (event) => {
            if (this.onMessage) {
                this.onMessage(event);
            }
        };

        this.websocket.onclose = (event) => {
            if (this.onClose) {
                this.onClose(event);
            }
        };

        this.websocket.onerror = (event) => {
            if (this.onError) {
                this.onError(event);
            }
        };
    }

    sendAudio(data) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        this.websocket.send(data);
    }

    disconnect() {
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
