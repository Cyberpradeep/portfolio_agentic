const statusEl = document.getElementById("status");
const messageLayerEl = document.getElementById("messageLayer");
const welcomeBubbleEl = document.getElementById("welcomeBubble");
const inputShellEl = document.getElementById("inputShell");
const textInputEl = document.getElementById("textInput");
const talkBtn = document.getElementById("talkBtn");
const sendBtn = document.getElementById("sendBtn");

const mediaHandler = new MediaHandler();
let eventsSource = null;
let speakingTimeout = null;
let currentAssistantMessageDiv = null;
let currentUserMessageDiv = null;
let hasInteracted = false;
let voiceMode = false;
let avatarReady = false;

const geminiClient = new GeminiClient({
    onOpen: () => {
        setStatus("connected", "connected");
        if (window.AvatarController) {
            window.AvatarController.setAvatarState("idle");
        }
        ensureEventsStream();
    },
    onMessage: (event) => {
        if (typeof event.data === "string") {
            try {
                const payload = JSON.parse(event.data);
                handleEventMessage(payload);
            } catch (_) {
                // Ignore non-JSON text websocket messages.
            }
            return;
        }

        if (typeof event.data !== "string") {
            mediaHandler.playAudio(event.data);
            if (window.AvatarController) {
                window.AvatarController.setAvatarState("speaking");
                window.AvatarController.setSpeaking(true);
            }

            if (speakingTimeout) {
                clearTimeout(speakingTimeout);
            }
            speakingTimeout = setTimeout(() => {
                if (window.AvatarController) {
                    window.AvatarController.setSpeaking(false);
                }
            }, 1200);
        }
    },
    onClose: () => {
        setStatus("disconnected");
        if (window.AvatarController) {
            window.AvatarController.setAvatarState("idle");
            window.AvatarController.setSpeaking(false);
        }
    },
    onError: () => {
        setStatus("error", "error");
    },
});

function setStatus(text, className = "") {
    statusEl.textContent = text;
    statusEl.className = `status-pill ${className}`.trim();
}

function initAvatar() {
    if (avatarReady) {
        return;
    }
    if (!window.AvatarController) {
        setTimeout(initAvatar, 100);
        return;
    }
    window.AvatarController.initAvatar("viewer", "avatarState");
    window.AvatarController.setAvatarState("idle");
    avatarReady = true;
}

function hideWelcomeBubble() {
    if (welcomeBubbleEl) {
        welcomeBubbleEl.classList.add("is-hidden");
        welcomeBubbleEl.classList.remove("is-visible");
    }
}

function showMessageLayer() {
    if (messageLayerEl) {
        messageLayerEl.classList.add("is-active");
    }
}

function markInteraction() {
    if (!hasInteracted) {
        hasInteracted = true;
        hideWelcomeBubble();
    }
    showMessageLayer();
}

function setVoiceMode(active) {
    voiceMode = active;
    talkBtn.classList.toggle("is-active", active);
    talkBtn.textContent = active ? "Stop Talking" : "Talk With Me";
    inputShellEl.classList.toggle("is-hidden", active);
}

function appendMessage(type, text) {
    if (!text || !text.trim()) {
        return null;
    }

    markInteraction();

    const div = document.createElement("div");
    div.className = `message-bubble ${type === "assistant" ? "assistant" : "user"}`;
    div.textContent = text;

    messageLayerEl.appendChild(div);
    while (messageLayerEl.children.length > 6) {
        messageLayerEl.removeChild(messageLayerEl.firstChild);
    }
    return div;
}

function appendStreamingChunk(type, text, finalized) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
        return;
    }

    let target = type === "assistant" ? currentAssistantMessageDiv : currentUserMessageDiv;
    if (!target) {
        target = appendMessage(type, trimmed);
    } else {
        target.textContent = `${target.textContent} ${trimmed}`.replace(/\s+/g, " ").trim();
    }

    if (type === "assistant") {
        currentAssistantMessageDiv = finalized ? null : target;
    } else {
        currentUserMessageDiv = finalized ? null : target;
    }
}

function handleEventMessage(payload) {
    if (!payload || !payload.type) {
        return;
    }

    if (payload.type === "user") {
        const text = (payload.text || "").trim();
        if (!text) {
            return;
        }

        appendStreamingChunk("user", text, true);
        if (window.AvatarController) {
            window.AvatarController.setAvatarState("thinking");
        }
        return;
    }

    if (payload.type === "assistant") {
        const text = (payload.text || "").trim();
        if (!text) {
            return;
        }

        appendStreamingChunk("assistant", text, false);
        if (window.AvatarController) {
            window.AvatarController.setAvatarState("speaking");
        }
        return;
    }

    if (payload.type === "turn_complete") {
        currentAssistantMessageDiv = null;
        currentAssistantMessageDiv = null;
        currentUserMessageDiv = null;
        if (window.AvatarController) {
            window.AvatarController.setAvatarState("idle");
            window.AvatarController.setSpeaking(false);
        }
        return;
    }

    if (payload.type === "status") {
        const state = payload.state || "idle";
        if (state === "connected") {
            setStatus("connected", "connected");
        }
        if (state === "disconnected") {
            setStatus("disconnected");
        }
        if (window.AvatarController) {
            window.AvatarController.setAvatarState(state === "connected" ? "idle" : state);
        }
        return;
    }

    if (payload.type === "error") {
        setStatus("error", "error");
        appendMessage("assistant", `Error: ${payload.message || "Unknown error"}`);
    }
}

function ensureEventsStream() {
    if (eventsSource) {
        eventsSource.close();
    }

    eventsSource = new EventSource("/events");
    eventsSource.onmessage = (evt) => {
        try {
            const payload = JSON.parse(evt.data);
            handleEventMessage(payload);
        } catch (_) {
            // ignore malformed event payloads
        }
    };

    eventsSource.onerror = () => {
        setStatus("events reconnecting");
    };
}

async function sendText() {
    const text = textInputEl.value.trim();
    if (!text) {
        return;
    }

    appendMessage("user", text);
    textInputEl.value = "";

    try {
        await ensureConnection();
        const response = await fetch("/text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            appendMessage("assistant", `Text send failed: ${data.detail || response.statusText}`);
        }
    } catch (err) {
        appendMessage("assistant", `Connection failed: ${err.message}`);
    }
}

async function ensureConnection() {
    initAvatar();

    if (geminiClient.isConnected()) {
        ensureEventsStream();
        return;
    }

    setStatus("connecting");

    try {
        await mediaHandler.initializeAudio();
        geminiClient.connect();
        ensureEventsStream();
    } catch (err) {
        setStatus("connection failed", "error");
        throw err;
    }
}

async function startVoiceMode() {
    markInteraction();
    setVoiceMode(true);

    try {
        await ensureConnection();
        if (!mediaHandler.isRecording) {
            await mediaHandler.startAudio((pcmData) => {
                if (geminiClient.isConnected()) {
                    geminiClient.sendAudio(pcmData);
                }
            });
        }
        if (window.AvatarController) {
            window.AvatarController.setAvatarState("listening");
        }
    } catch (err) {
        appendMessage("assistant", `Mic start failed: ${err.message}`);
        setVoiceMode(false);
    }
}

function stopVoiceMode() {
    mediaHandler.stopAudio();
    mediaHandler.stopAudioPlayback();
    setVoiceMode(false);
    if (window.AvatarController) {
        window.AvatarController.setAvatarState("idle");
        window.AvatarController.setSpeaking(false);
    }
}

talkBtn.addEventListener("click", async () => {
    if (!voiceMode) {
        await startVoiceMode();
        hideWelcomeBubble();
        return;
    }

    stopVoiceMode();
});

sendBtn.addEventListener("click", () => {
    sendText();
});

textInputEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendText();
    }
});

initAvatar();

if (welcomeBubbleEl) {
    requestAnimationFrame(() => {
        welcomeBubbleEl.classList.add("is-visible");
    });
}
