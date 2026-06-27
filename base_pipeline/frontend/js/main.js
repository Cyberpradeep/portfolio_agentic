const statusEl = document.getElementById("status");
const convLeftEl = document.getElementById("convLeft");
const convRightEl = document.getElementById("convRight");
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

function setVoiceMode(active) {
    voiceMode = active;
    talkBtn.classList.toggle("is-active", active);
    talkBtn.textContent = active ? "Stop Talking" : "Talk With Me";
    inputShellEl.classList.toggle("is-hidden", active);
}

let autoFadeTimer = null;

function showConvCard(el, label, text, cssClass) {
    // Clear previous content
    el.innerHTML = "";
    el.className = `conv-card ${cssClass}`;

    const labelEl = document.createElement("span");
    labelEl.className = "conv-label";
    labelEl.textContent = label;

    const textEl = document.createElement("p");
    textEl.className = `conv-text ${cssClass}`;
    textEl.textContent = text;

    el.appendChild(labelEl);
    el.appendChild(textEl);

    // Force reflow before adding is-visible so transition fires
    el.getBoundingClientRect();
    el.classList.add("is-visible");
    el.classList.remove("is-fading");
}

function fadeOutCards() {
    [convLeftEl, convRightEl].forEach((el) => {
        el.classList.add("is-fading");
        el.classList.remove("is-visible");
    });
}

function markInteraction() {
    if (!hasInteracted) {
        hasInteracted = true;
        hideWelcomeBubble();
    }
}

function appendMessage(type, text) {
    if (!text || !text.trim()) return null;
    markInteraction();

    if (type === "user") {
        // New user message: fade out both old cards first
        if (autoFadeTimer) clearTimeout(autoFadeTimer);
        fadeOutCards();
        setTimeout(() => {
            showConvCard(convLeftEl, "YOU", text.trim(), "user");
            // Clear the AI card content when new user message comes
            convRightEl.classList.remove("is-visible");
            convRightEl.classList.add("is-fading");
        }, 400);
    } else {
        showConvCard(convRightEl, "PRADEEP AI", text.trim(), "assistant");
        // Auto-fade both cards after 12 seconds
        if (autoFadeTimer) clearTimeout(autoFadeTimer);
        autoFadeTimer = setTimeout(fadeOutCards, 12000);
    }

    return type === "user" ? convLeftEl : convRightEl;
}

function appendStreamingChunk(type, text, finalized) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    markInteraction();

    if (type === "user") {
        if (!currentUserMessageDiv) {
            if (autoFadeTimer) clearTimeout(autoFadeTimer);
            fadeOutCards();
            setTimeout(() => {
                convLeftEl.innerHTML = "";
                convLeftEl.className = "conv-card user";
                const labelEl = document.createElement("span");
                labelEl.className = "conv-label";
                labelEl.textContent = "YOU";
                const textEl = document.createElement("p");
                textEl.className = "conv-text user";
                textEl.textContent = trimmed;
                convLeftEl.appendChild(labelEl);
                convLeftEl.appendChild(textEl);
                convLeftEl.getBoundingClientRect();
                convLeftEl.classList.add("is-visible");
                convLeftEl.classList.remove("is-fading");
                convRightEl.classList.remove("is-visible");
                convRightEl.classList.add("is-fading");
                currentUserMessageDiv = convLeftEl.querySelector(".conv-text.user");
            }, 400);
        } else {
            currentUserMessageDiv.textContent = trimmed;
        }
        if (finalized) currentUserMessageDiv = null;
    } else {
        if (!currentAssistantMessageDiv) {
            convRightEl.innerHTML = "";
            convRightEl.className = "conv-card assistant";
            const labelEl = document.createElement("span");
            labelEl.className = "conv-label";
            labelEl.textContent = "PRADEEP AI";
            const textEl = document.createElement("p");
            textEl.className = "conv-text assistant";
            textEl.textContent = trimmed;
            convRightEl.appendChild(labelEl);
            convRightEl.appendChild(textEl);
            convRightEl.getBoundingClientRect();
            convRightEl.classList.add("is-visible");
            convRightEl.classList.remove("is-fading");
            currentAssistantMessageDiv = textEl;
        } else {
            currentAssistantMessageDiv.textContent = `${currentAssistantMessageDiv.textContent} ${trimmed}`.replace(/\s+/g, " ").trim();
        }
        if (finalized) {
            currentAssistantMessageDiv = null;
            if (autoFadeTimer) clearTimeout(autoFadeTimer);
            autoFadeTimer = setTimeout(fadeOutCards, 12000);
        }
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

        // Auto-hide any open project cards when the user sends a new message
        dismissOrbitCards();
        document.querySelectorAll(".single-project-card, .experience-timeline, .cert-grid-container, .skills-bento-container, .floating-skill").forEach(el => {
            el.style.opacity = "0";
            if (el.classList.contains("single-project-card") || el.classList.contains("project-orbit-card")) {
                el.style.transform = "translate(-50%, -50%) translateY(40px)";
            }
            setTimeout(() => el.remove(), 500);
        });
        document.body.classList.remove("hide-conv");

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

    if (payload.type === "open_link") {
        if (payload.url) {
            window.open(payload.url, "_blank");
        }
        return;
    }

    if (payload.type === "show_skills") {
        if (!payload.quadrants || !Array.isArray(payload.quadrants)) return;
        
        const stage = document.querySelector(".stage");
        if (!stage) return;

        // Clear any project cards or timelines when showing skills
        dismissOrbitCards();
        document.querySelectorAll(".single-project-card, .experience-timeline, .cert-grid-container, .skills-bento-container, .floating-skill").forEach(el => {
            el.style.opacity = "0";
            el.style.transform = "translate(-50%, -50%) translateY(40px)";
            setTimeout(() => el.remove(), 500);
        });

        // Add hide-conv because this is a primary view now
        document.body.classList.add("hide-conv");

        const isMobile = window.innerWidth < 640;
        
        // 1. Spawning Ambient Floating Icons
        if (payload.skills && Array.isArray(payload.skills)) {
            const iconMap = {
                "python": "python/python-original.svg",
                "javascript": "javascript/javascript-original.svg",
                "java": "java/java-original.svg",
                "html": "html5/html5-original.svg",
                "css": "css3/css3-original.svg",
                "fastapi": "fastapi/fastapi-original.svg",
                "flask": "flask/flask-original.svg",
                "nodejs": "nodejs/nodejs-original.svg",
                "websockets": "socketio/socketio-original.svg",
                "mysql": "mysql/mysql-original.svg",
                "mongodb": "mongodb/mongodb-original.svg",
                "sqlite": "sqlite/sqlite-original.svg",
                "supabase": "supabase/supabase-original.svg",
                "azure": "azure/azure-original.svg",
                "git": "git/git-original.svg",
                "github": "github/github-original.svg",
                "docker": "docker/docker-original.svg",
                "bootstrap": "bootstrap/bootstrap-original.svg",
                "react": "react/react-original.svg",
                "threejs": "threejs/threejs-original.svg",
                "gemini": "google/google-original.svg"
            };

            payload.skills.forEach((skill) => {
                const skillKey = skill.toLowerCase();
                const iconPath = iconMap[skillKey] || null;
                if (!iconPath) return; // Only spawn if we have an icon, to keep it clean

                const el = document.createElement("div");
                el.className = "floating-skill";
                
                const spreadVw = isMobile ? 25 : 35;
                const randomX = (Math.random() - 0.5) * 2 * spreadVw;
                const delay = Math.random() * 2;
                
                // Randomize vertical start point slightly so they don't all clump
                const randomY = (Math.random() * 40) + 10;

                el.style.left = `calc(50% + ${randomX}vw)`;
                el.style.bottom = `${randomY}%`;
                el.style.animationDelay = `-${delay * 5}s`; // start at random phase

                const img = document.createElement("img");
                img.src = `https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${iconPath}`;
                img.onerror = () => el.remove();
                el.appendChild(img);
                
                stage.appendChild(el);
                
                // Fade in
                setTimeout(() => el.classList.add("is-visible"), 100);
            });
        }

        // 2. Build the Bento Box Grid
        const container = document.createElement("div");
        container.className = "skills-bento-container";
        
        container.innerHTML = `
            <div class="bento-col bento-col-left"></div>
            <div class="bento-col bento-col-right"></div>
        `;
        const leftCol = container.querySelector(".bento-col-left");
        const rightCol = container.querySelector(".bento-col-right");

        payload.quadrants.forEach((quad, i) => {
            const el = document.createElement("div");
            el.className = "bento-panel";
            
            const chips = quad.items.map(t => `<span class="bento-chip">${t}</span>`).join("");
            
            el.innerHTML = `
                <div class="bento-title">${quad.title}</div>
                <div class="bento-chips">${chips}</div>
            `;
            
            if (i < 2) {
                leftCol.appendChild(el);
            } else {
                rightCol.appendChild(el);
            }

            setTimeout(() => {
                el.classList.add("is-visible");
            }, i * 150 + 100);
        });

        stage.appendChild(container);
        return;
    }

    if (payload.type === "show_projects") {
        if (!payload.projects || !Array.isArray(payload.projects)) return;

        const stage = document.querySelector(".stage");
        if (!stage) return;

        // Clear any existing orbit cards
        document.querySelectorAll(".project-orbit-card").forEach(el => el.remove());

        // Clear any existing single project card or timeline
        document.querySelectorAll(".single-project-card, .experience-timeline, .cert-grid-container, .skills-bento-container, .floating-skill").forEach(el => {
            el.style.opacity = "0";
            if (el.classList.contains("single-project-card") || el.classList.contains("project-orbit-card")) {
                el.style.transform = "translate(-50%, -50%) translateY(40px)";
            }
            setTimeout(() => el.remove(), 500);
        });
        document.body.classList.remove("hide-conv");

        const projects = payload.projects;
        const isMobile = window.innerWidth < 640;

        // 6 orbit slots around the avatar
        const orbitSlots = [
            { top: "12%",  left: "14%",  flyFrom: "translate(-130%, -130%)" },
            { top: "12%",  right: "14%", flyFrom: "translate(130%, -130%)"  },
            { top: "42%",  left: "8%",   flyFrom: "translate(-140%, 0)"     },
            { top: "42%",  right: "8%",  flyFrom: "translate(140%, 0)"      },
            { top: "63%",  left: "18%",  flyFrom: "translate(-130%, 130%)"  },
            { top: "63%",  right: "18%", flyFrom: "translate(130%, 130%)"   },
        ];

        document.body.classList.add("hide-conv");

        const cardEls = [];

        projects.forEach((proj, i) => {
            const el = document.createElement("div");
            el.className = "project-orbit-card";
            el.dataset.projectName = proj.name;

            const chips = (proj.techs || []).slice(0, 3)
                .map(t => `<span class="poc-chip">${t}</span>`).join("");

            el.innerHTML = `
                <div class="poc-type">${proj.type || ""}</div>
                <div class="poc-name">${proj.name}</div>
                <div class="poc-summary">${(proj.summary || "").substring(0, 72)}…</div>
                <div class="poc-chips">${chips}</div>
            `;

            if (isMobile) {
                el.style.transform = "translateX(110vw)";
            } else {
                const slot = orbitSlots[i % orbitSlots.length];
                el.style.top   = slot.top;
                if (slot.left)  el.style.left  = slot.left;
                if (slot.right) el.style.right = slot.right;
                el.style.transform = slot.flyFrom;
                el.style.opacity   = "0";
            }

            el.addEventListener("click", () => {
                const name = el.dataset.projectName;
                dismissOrbitCards(() => {
                    sendTextProgrammatic(`Tell me about your ${name} project`);
                });
            });

            stage.appendChild(el);
            cardEls.push({ el, slot: orbitSlots[i % orbitSlots.length] });
        });

        // Staggered fly-in
        cardEls.forEach(({ el }, i) => {
            setTimeout(() => {
                el.style.transition = "transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.45s ease";
                el.style.transform  = "translate(0, 0)";
                el.style.opacity    = "1";
            }, i * 110);
        });

        return;
    }

    if (payload.type === "show_project") {
        if (!payload.project) return;
        const stage = document.querySelector(".stage");
        if (!stage) return;

        // Ensure orbit cards are dismissed before showing single project
        dismissOrbitCards();

        // Remove existing single card or timeline if any
        document.querySelectorAll(".single-project-card, .experience-timeline, .cert-grid-container, .skills-bento-container, .floating-skill").forEach(el => el.remove());
        document.body.classList.remove("hide-conv");

        const proj = payload.project;
        const el = document.createElement("div");
        el.className = "single-project-card";

        // Parse technologies
        let techs = [];
        if (proj.technologies) {
            if (Array.isArray(proj.technologies)) {
                techs = proj.technologies;
            } else if (typeof proj.technologies === 'object') {
                Object.values(proj.technologies).forEach(v => {
                    if (Array.isArray(v)) techs.push(...v);
                });
            }
        }
        const techChips = techs.map(t => `<span class="spc-chip">${t}</span>`).join("");

        // Parse features
        const featuresList = (proj.features || []).map(f => `<li>${f}</li>`).join("");
        const featuresHtml = featuresList ? `
            <div class="spc-section-title">Key Features</div>
            <ul class="spc-features">${featuresList}</ul>
        ` : '';

        // Parse links
        let linksHtml = '';
        if (proj.github_url) {
            linksHtml += `<a href="${proj.github_url}" target="_blank" class="spc-btn">GitHub Repository</a>`;
        }
        if (proj.live_link) {
            linksHtml += `<a href="${proj.live_link}" target="_blank" class="spc-btn secondary">View Live Project</a>`;
        }
        
        document.body.classList.add("hide-conv");

        el.innerHTML = `
            <div class="spc-pane spc-pane-left">
                <div class="spc-type">${proj.type || "Project"}</div>
                <div class="spc-name">${proj.name}</div>
                <div class="spc-desc">${proj.summary || ""}</div>
                ${featuresHtml}
            </div>
            <div class="spc-pane spc-pane-right">
                <button class="spc-close" aria-label="Close card">×</button>
                <div class="spc-section-title">Tech Stack</div>
                <div class="spc-chips">
                    ${techChips || '<span class="spc-chip">Not specified</span>'}
                </div>
                <div class="spc-links">
                    ${linksHtml}
                </div>
            </div>
        `;

        el.querySelector(".spc-close").addEventListener("click", () => {
            el.style.opacity = "0";
            el.style.transform = "translate(-50%, -50%) translateY(40px)";
            setTimeout(() => {
                el.remove();
                if (document.querySelectorAll(".project-orbit-card").length === 0) {
                    document.body.classList.remove("hide-conv");
                }
            }, 500);
        });

        stage.appendChild(el);
        // Trigger reflow for animation
        void el.offsetWidth;
        el.classList.add("is-visible");

        return;
    }

    if (payload.type === "show_experience") {
        if (!payload.experience) return;
        const data = payload.experience;
        const stage = document.querySelector(".stage");
        if (!stage) return;

        // Cleanup existing UI
        dismissOrbitCards();
        document.querySelectorAll(".single-project-card, .experience-timeline, .cert-grid-container, .skills-bento-container, .floating-skill").forEach(el => el.remove());
        document.body.classList.add("hide-conv");

        const combined = [];
        if (data.career_timeline) {
            data.career_timeline.forEach(c => {
                combined.push({
                    type: "milestone",
                    year: c.year,
                    title: c.milestone,
                    desc: c.description
                });
            });
        }
        if (data.professional_experience) {
            data.professional_experience.forEach(p => {
                let yr = 0;
                if (p.duration && p.duration.start) {
                    const match = p.duration.start.match(/\d{4}/);
                    if (match) yr = parseInt(match[0]);
                }
                combined.push({
                    type: "job",
                    year: yr,
                    title: p.role,
                    subtitle: `${p.company} | ${p.duration.start} - ${p.duration.end}`,
                    desc: p.primary_focus ? p.primary_focus.join(", ") : (p.key_learnings ? p.key_learnings.join(", ") : "")
                });
            });
        }
        
        // Sort descending
        combined.sort((a, b) => b.year - a.year);

        const el = document.createElement("div");
        el.className = "experience-timeline";
        
        let html = '<div class="timeline-container">';
        combined.forEach(item => {
            const isMilestone = item.type === "milestone";
            html += `
                <div class="timeline-item ${isMilestone ? 'milestone' : ''}">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                        <div class="timeline-year">${item.year || ''}</div>
                        <div class="timeline-title">${item.title}</div>
                        ${item.subtitle ? `<div class="timeline-subtitle">${item.subtitle}</div>` : ''}
                        <div class="timeline-desc">${item.desc || ''}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        el.innerHTML = html;
        stage.appendChild(el);

        // Trigger animations
        setTimeout(() => {
            el.querySelectorAll(".timeline-item").forEach((item, i) => {
                setTimeout(() => item.classList.add("is-visible"), i * 150);
            });
        }, 50);

        return;
    }

    if (payload.type === "show_certifications") {
        if (!payload.certifications || !payload.certifications.length) return;
        const certs = payload.certifications;
        const stage = document.querySelector(".stage");
        if (!stage) return;

        // Cleanup existing UI
        dismissOrbitCards();
        document.querySelectorAll(".single-project-card, .experience-timeline, .cert-grid-container, .skills-bento-container, .floating-skill").forEach(el => el.remove());
        document.body.classList.add("hide-conv");

        const container = document.createElement("div");
        container.className = "cert-grid-container";
        
        container.innerHTML = `
            <div class="cert-col cert-col-left"></div>
            <div class="cert-col cert-col-right"></div>
        `;
        const leftCol = container.querySelector(".cert-col-left");
        const rightCol = container.querySelector(".cert-col-right");

        const logos = {
            "Microsoft": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" class="cert-logo"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg>`,
            "GitHub": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="cert-logo"><path fill="#181717" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`,
            "NPTEL": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="cert-logo"><path fill="#000" d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72l5 2.73 5-2.73v3.72z"/></svg>`
        };

        certs.forEach((cert, i) => {
            if (i > 3) return; // Only up to 4
            
            const el = document.createElement("div");
            el.className = `cert-card`;

            const logo = logos[cert.provider] || logos["NPTEL"];
            const skills = (cert.skills_gained || []).slice(0, 3).map(s => `<span class="cert-skill-chip">${s}</span>`).join("");

            let verifyBtnHtml = "";
            if (cert.verify_url && cert.verify_url !== "#") {
                verifyBtnHtml = `<a href="${cert.verify_url}" target="_blank" class="cert-verify-btn">Verify Certificate</a>`;
            }

            el.innerHTML = `
                <div class="cert-header">
                    ${logo}
                    <div class="cert-provider">${cert.provider}</div>
                </div>
                <div class="cert-name">${cert.name}</div>
                <div class="cert-skills">${skills}</div>
                ${verifyBtnHtml}
            `;

            // Alternate putting them in left and right column
            if (i % 2 === 0) {
                leftCol.appendChild(el);
            } else {
                rightCol.appendChild(el);
            }

            // Animate in
            setTimeout(() => {
                el.classList.add("is-visible");
            }, i * 150 + 100);
        });

        stage.appendChild(container);
        return;
    }

    if (payload.type === "error") {
        setStatus("error", "error");
        appendMessage("assistant", `Error: ${payload.message || "Unknown error"}`);
    }
}

// ── Orbit card helpers ─────────────────────────────────────────────────────

function dismissOrbitCards(onDone) {
    const cards = [...document.querySelectorAll(".project-orbit-card")];
    if (!cards.length) { 
        if (document.querySelectorAll(".single-project-card, .experience-timeline, .cert-grid-container, .skills-bento-container").length === 0) {
            document.body.classList.remove("hide-conv");
        }
        onDone && onDone(); 
        return; 
    }
    
    let completed = 0;
    cards.forEach((el) => {
        el.style.transition = "transform 0.4s ease, opacity 0.3s ease";
        el.style.transform = "translateY(20px)";
        el.style.opacity = "0";
        setTimeout(() => {
            if (el.parentNode) el.remove();
            completed++;
            if (completed === cards.length) {
                if (document.querySelectorAll(".single-project-card, .experience-timeline, .cert-grid-container, .skills-bento-container").length === 0) {
                    document.body.classList.remove("hide-conv");
                }
                onDone && onDone();
            }
        }, 400);
    });
}

async function sendTextProgrammatic(text) {
    appendMessage("user", text);
    try {
        await ensureConnection();
        await fetch("/text", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ text }),
        });
    } catch (err) {
        appendMessage("assistant", `Connection failed: ${err.message}`);
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

textInputEl.addEventListener("focus", async () => {
    if (!geminiClient.isConnected()) {
        try {
            await ensureConnection();
            hideWelcomeBubble();
        } catch (e) {
            console.error("Failed to connect on focus:", e);
        }
    }
});


initAvatar();

if (welcomeBubbleEl) {
    requestAnimationFrame(() => {
        welcomeBubbleEl.classList.add("is-visible");
    });
    // Auto-fade after 8 seconds
    setTimeout(() => {
        hideWelcomeBubble();
    }, 8000);
}
