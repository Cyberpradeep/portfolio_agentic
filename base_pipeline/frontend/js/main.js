import { AvatarController } from './avatar.js';

// ==========================================================================
// DOM ELEMENTS
// ==========================================================================
const convHistoryEl = document.getElementById('convHistory');
const convActiveEl = document.getElementById('convActive');
const activeStatementEl = convActiveEl ? convActiveEl.querySelector('.active-statement') : null;
const userQueryBadgeEl = document.getElementById('userQueryBadge');
const userQueryTextEl = document.getElementById('userQueryText');
const genuiContainerEl = document.getElementById('genuiContainer');
const textInputEl = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const talkBtn = document.getElementById('talkBtn');
const talkBtnTextEl = document.getElementById('talkBtnText');
const unifiedDockEl = document.getElementById('unifiedDock');
const switchToTextBtn = document.getElementById('switchToTextBtn');
const switchToVoiceBtn = document.getElementById('switchToVoiceBtn');
const contactModalBtn = document.getElementById('contactModalBtn');
const idleStreamEl = document.getElementById('idleReasoningStream');
const thoughtReasoningWrapEl = document.getElementById('thoughtReasoningWrap');
const reasoningTraceEl = document.getElementById('reasoningTrace');
const reasoningCursorEl = document.getElementById('reasoningCursor');
const thoughtIndexTagEl = document.getElementById('thoughtIndexTag');
const promptSparksEl = document.getElementById('promptSparks');

// ==========================================================================
// STATE
// ==========================================================================
const mediaHandler = new MediaHandler();
let isVoiceActive = false;
let currentStreamingChunk = '';

// Global AudioContext unlocker on first user interaction
const unlockAudioOnGesture = () => {
  mediaHandler.initializeAudio();
  document.removeEventListener('click', unlockAudioOnGesture);
  document.removeEventListener('keydown', unlockAudioOnGesture);
  document.removeEventListener('touchstart', unlockAudioOnGesture);
};
document.addEventListener('click', unlockAudioOnGesture, { once: true });
document.addEventListener('keydown', unlockAudioOnGesture, { once: true });
document.addEventListener('touchstart', unlockAudioOnGesture, { once: true });

// ==========================================================================
// GEMINI WEBSOCKET CLIENT
// ==========================================================================
let hasEverEngaged = false;

function handleSessionPaused() {
  console.log('[SESSION] Standby triggered. Context preserved.');
  isVoiceActive = false;
  mediaHandler.stopAudio();
  mediaHandler.stopAudioPlayback();
  AvatarController.setAvatarState('idle');
  AvatarController.setSpeaking(false);
  updateVoiceButtonUI(true);
  setDockMode('voice');
  if (activeStatementEl && !activeStatementEl.textContent.includes('Resume')) {
    pushToHistory(activeStatementEl.textContent);
    activeStatementEl.textContent = 'Voice dialogue is paused. Click "Resume Voice" or choose a prompt to continue.';
    activeStatementEl.classList.remove('is-medium-text', 'is-long-text');
  }
}

function setDockMode(mode) {
  if (!unifiedDockEl) return;
  if (mode === 'text') {
    unifiedDockEl.classList.remove('is-voice-mode');
    unifiedDockEl.classList.add('is-text-mode');
    if (textInputEl) {
      setTimeout(() => textInputEl.focus(), 120);
    }
  } else {
    unifiedDockEl.classList.remove('is-text-mode');
    unifiedDockEl.classList.add('is-voice-mode');
  }
}

let hasRevealedIntro = false;
function notifyGreetingStarted() {
  if (hasRevealedIntro) return;
  hasRevealedIntro = true;
  console.log('[AUTOGREET] Inbound voice/speech stream active: dispatching session:ready_to_reveal...');
  window.dispatchEvent(new CustomEvent('session:ready_to_reveal'));
}

const geminiClient = new GeminiClient({
  autoConnect: false,
  onOpen: () => {
    console.log('[WS] Connected to /audio');
    AvatarController.setAvatarState('idle');
    const introStatusEl = document.getElementById('introStatusText');
    if (introStatusEl) {
      introStatusEl.textContent = "SYNCHRONIZING NEURAL VOICE TWIN...";
    }
    if (activeStatementEl && activeStatementEl.textContent.includes('Initializing')) {
      activeStatementEl.textContent = "Neural Link established. Standing by...";
    }
  },
  onMessage: (event) => {
    if (typeof event.data === 'string') {
      try {
        const payload = JSON.parse(event.data);
        handleServerPayload(payload);
      } catch (_) {}
      return;
    }

    // Binary: 24kHz PCM audio frames from Gemini Live speech output
    mediaHandler.playAudio(event.data);
    notifyGreetingStarted();
    AvatarController.setAvatarState('speaking');
    AvatarController.setSpeaking(true);
  },
  onSessionPaused: (payload) => {
    handleSessionPaused();
  },
  onClose: (event, meta) => {
    console.log('[WS] Disconnected from /audio', meta);
    if (meta && meta.wasPaused) {
      handleSessionPaused();
    } else {
      AvatarController.setAvatarState('idle');
      AvatarController.setSpeaking(false);
      isVoiceActive = false;
      updateVoiceButtonUI();
    }
  },
  onError: (e) => {
    console.error('[WS] Error:', e);
    notifyGreetingStarted();
  }
});

// ==========================================================================
// SSE /events — TOOL/GENUI BROADCAST CHANNEL
// ==========================================================================
let eventSource = null;
function setupEventSource() {
  if (eventSource) return;
  try {
    const sid = (geminiClient && geminiClient.sessionId) || sessionStorage.getItem('portfolio_session_id') || '';
    const sseUrl = sid ? `/events?session_id=${encodeURIComponent(sid)}` : '/events';
    eventSource = new EventSource(sseUrl);
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        handleServerPayload(payload);
      } catch (_) {}
    };
    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
        setTimeout(setupEventSource, 3000);
      }
    };
  } catch (_) {}
}

// ==========================================================================
// INIT
// ==========================================================================
function init() {
  AvatarController.initAvatar('viewer');
  setupEventListeners();
  setupEventSource();
}

// ==========================================================================
// CONVERSATIONAL STACK (Left Editorial Column)
// ==========================================================================
function pushToHistory(text) {
  if (!text || !convHistoryEl) return;
  const clean = text.trim();
  if (!clean || clean === 'Thinking...' || clean.startsWith('Synthesizing') || clean.startsWith('Initializing') || clean.startsWith('Neural Link') || clean.startsWith('Connecting') || clean === '...') return;

  const item = document.createElement('div');
  item.className = 'conv-history-item';
  item.textContent = clean;
  item.title = 'Click to paste into prompt';
  item.addEventListener('click', () => {
    if (textInputEl) {
      textInputEl.value = clean;
      textInputEl.focus();
    }
  });
  convHistoryEl.appendChild(item);

  // Keep max 2 blurred history items
  while (convHistoryEl.children.length > 2) {
    convHistoryEl.removeChild(convHistoryEl.firstChild);
  }
}

function setUserQueryBadge(text) {
  if (!userQueryBadgeEl || !userQueryTextEl) return;
  const clean = (text || '').trim();
  if (clean) {
    userQueryTextEl.textContent = clean;
    userQueryBadgeEl.classList.remove('is-hidden');
  } else {
    userQueryBadgeEl.classList.add('is-hidden');
  }
}

function dismissPromptSparks() {
  if (!promptSparksEl) return;
  promptSparksEl.classList.add('is-hidden');
  setTimeout(() => {
    if (promptSparksEl) {
      promptSparksEl.style.display = 'none';
    }
  }, 380);
}

function handleNewUserTurn(userQuery, preserveGenUI = false) {
  // Dismiss idle reasoning stream upon dialogue engagement
  dismissIdleStream();

  // Permanently dismiss prompt sparks on user dialogue
  dismissPromptSparks();

  // Stop existing audio playback immediately
  mediaHandler.stopAudioPlayback();

  // Dismiss previous GenUI cards unless explicitly preserved
  if (!preserveGenUI) {
    clearGenUI();
  }

  if (activeStatementEl && activeStatementEl.textContent) {
    pushToHistory(activeStatementEl.textContent);
  }
  setUserQueryBadge(userQuery);
  currentStreamingChunk = '';
  if (activeStatementEl) {
    activeStatementEl.textContent = 'Synthesizing response...';
    activeStatementEl.classList.remove('is-medium-text', 'is-long-text');
  }
  if (convActiveEl) {
    convActiveEl.scrollTop = 0;
  }
  AvatarController.setAvatarState('thinking');
  AvatarController.updateTranscript(`YOU: ${userQuery}`);
}

function handleAssistantStreamChunk(aiText, isFinal = false) {
  if (!activeStatementEl) return;

  currentStreamingChunk = (aiText || '').trim();

  if (currentStreamingChunk) {
    notifyGreetingStarted();
    activeStatementEl.textContent = currentStreamingChunk;

    // Dynamic Font Scaling based on text volume
    const charCount = currentStreamingChunk.length;
    if (charCount > 220) {
      activeStatementEl.classList.add('is-long-text');
      activeStatementEl.classList.remove('is-medium-text');
    } else if (charCount > 95) {
      activeStatementEl.classList.add('is-medium-text');
      activeStatementEl.classList.remove('is-long-text');
    } else {
      activeStatementEl.classList.remove('is-medium-text', 'is-long-text');
    }

    // Smart auto-scroll: only follow stream if user was already near the bottom (prevents scroll-fighting if user is reading previous text)
    if (convActiveEl && convActiveEl.scrollHeight > convActiveEl.clientHeight) {
      const distanceFromBottom = convActiveEl.scrollHeight - convActiveEl.scrollTop - convActiveEl.clientHeight;
      if (distanceFromBottom < 48) {
        convActiveEl.scrollTop = convActiveEl.scrollHeight;
      }
    }

    AvatarController.updateTranscript(currentStreamingChunk);
  }
}

// Global server payload deduplication (prevents concurrent WebSocket + SSE duplicates)
const processedEventIds = new Set();
const recentEventFingerprints = new Map();

function isDuplicateServerPayload(payload) {
  if (!payload || !payload.type) return false;

  // 1. Backend-assigned unique event ID
  if (payload.id) {
    if (processedEventIds.has(payload.id)) {
      return true;
    }
    processedEventIds.add(payload.id);
    if (processedEventIds.size > 200) {
      const first = processedEventIds.values().next().value;
      processedEventIds.delete(first);
    }
  }

  // 2. Fallback payload fingerprint (2.5s window to filter dual WS + SSE delivery)
  const fp = `${payload.type}:${payload.url || (payload.project && payload.project.name) || payload.text || ''}`;
  const now = Date.now();
  const last = recentEventFingerprints.get(fp);
  if (last && (now - last) < 2500) {
    return true;
  }
  recentEventFingerprints.set(fp, now);
  if (recentEventFingerprints.size > 60) {
    for (const [k, t] of recentEventFingerprints.entries()) {
      if (now - t > 8000) recentEventFingerprints.delete(k);
    }
  }
  return false;
}

let lastOpenedLinkUrl = '';
let lastOpenedLinkTimestamp = 0;

function openSingleExternalWindow(rawUrl) {
  if (!rawUrl) return;
  const url = rawUrl.trim();
  const now = Date.now();

  // Deduplicate identical URLs within 4 seconds
  if (url === lastOpenedLinkUrl && (now - lastOpenedLinkTimestamp) < 4000) {
    console.log('[OPEN_LINK] Ignored duplicate request for URL:', url);
    return;
  }

  // Throttle rapid successive window openings (minimum 1.5s gap)
  if ((now - lastOpenedLinkTimestamp) < 1500) {
    console.log('[OPEN_LINK] Throttled rapid consecutive window opening:', url);
    return;
  }

  lastOpenedLinkUrl = url;
  lastOpenedLinkTimestamp = now;

  console.log('[OPEN_LINK] Opening exactly 1 window for:', url);

  // Single clean trigger: create an anchor element, click once, and clean up.
  // Never run both window.open AND a.click() sequentially.
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.warn('[OPEN_LINK] Anchor click failed, attempting window.open:', err);
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) {}
  }
}

// ==========================================================================
// SERVER PAYLOAD HANDLER
// ==========================================================================
function handleServerPayload(payload) {
  if (!payload || !payload.type) return;

  // Filter out duplicate events dispatched across both WebSocket and SSE channels
  if (isDuplicateServerPayload(payload)) {
    return;
  }

  switch (payload.type) {
    case 'user_stream': {
      const liveUserText = (payload.text || '').trim();
      if (liveUserText) {
        setUserQueryBadge(liveUserText);
        AvatarController.updateTranscript(`YOU: ${liveUserText}`);
      }
      break;
    }

    case 'assistant_stream': {
      const liveAiText = (payload.text || '').trim();
      if (liveAiText) {
        handleAssistantStreamChunk(liveAiText, false);
      }
      break;
    }

    case 'user': {
      const userText = (payload.text || '').trim();
      if (userText) {
        handleNewUserTurn(userText);
      }
      break;
    }

    case 'assistant': {
      const aiText = (payload.text || '').trim();
      if (aiText) {
        handleAssistantStreamChunk(aiText, true);
      }
      break;
    }

    case 'turn_complete':
      currentStreamingChunk = '';
      AvatarController.setAvatarState('idle');
      AvatarController.setSpeaking(false);
      resetInactivityWatchdog();
      break;

    case 'status': {
      const state = payload.state || 'idle';
      if (state === 'listening') {
        AvatarController.setAvatarState('listening');
      } else if (state === 'thinking') {
        AvatarController.setAvatarState('thinking');
      } else if (state === 'speaking') {
        AvatarController.setAvatarState('speaking');
      } else if (state === 'connected' || state === 'idle' || state === 'ready') {
        AvatarController.setAvatarState('idle');
      }
      break;
    }

    case 'session_paused':
      handleSessionPaused();
      break;

    // --- GenUI Tool Events ---
    case 'show_project':
      if (payload.project) {
        renderGenUIProjectBento(payload.project);
      }
      break;

    case 'show_projects':
      if (payload.projects) {
        renderGenUIProjectsList(payload.projects);
      }
      break;

    case 'show_skills':
      if (payload.quadrants) {
        renderGenUISkillsMatrix(payload.quadrants);
      }
      break;

    case 'show_experience':
      AvatarController.unlockScreen();
      if (payload.experience) {
        renderGenUIExperienceTimeline(payload.experience);
      }
      break;

    case 'show_certifications':
      if (payload.certifications) {
        const isSingle = !!payload.single_cert;
        renderGenUICertifications(payload.certifications, isSingle);

        if (isSingle) {
          const list = Array.isArray(payload.certifications) ? payload.certifications : [payload.certifications];
          const cert = list[0] || {};
          const imgUrl = payload.active_image || cert.image || '/static/assests/azure_ai_apps_and_agents_associate.png';
          const title = payload.title || cert.name || 'AZURE AI AGENTS ASSOCIATE';
          AvatarController.displayImage(imgUrl, title, true);
        } else if (payload.images && payload.images.length > 0) {
          AvatarController.displayImageCarousel(payload.images, 3.8);
        } else {
          const list = Array.isArray(payload.certifications) ? payload.certifications : (payload.certifications.completed_certifications || []);
          const certImages = list.filter(c => c.image).map(c => ({ url: c.image, title: c.name }));
          if (certImages.length > 1) {
            AvatarController.displayImageCarousel(certImages, 3.8);
          } else if (certImages.length === 1) {
            AvatarController.displayImage(certImages[0].url, certImages[0].title, true);
          } else {
            AvatarController.displayImage('/static/assests/azure_ai_apps_and_agents_associate.png', 'AZURE AI AGENTS ASSOCIATE', true);
          }
        }
      }
      break;

    case 'show_github_activity':
      AvatarController.unlockScreen();
      renderGenUIGitHubActivity(payload);
      break;

    case 'open_link':
      if (payload.url) {
        openSingleExternalWindow(payload.url);
      }
      break;
  }
}// ==========================================================================
// STUDIO RIGHT FLANK GENUI RENDERERS
// ==========================================================================

let lastGenUICall = null;

function setGenUIOpen(isOpen) {
  if (isOpen) {
    document.body.classList.add('has-genui-open');
    dismissIdleStream();
  } else {
    document.body.classList.remove('has-genui-open');
    resetInactivityWatchdog();
  }
  AvatarController.setGenUIActive(isOpen);
}

function clearGenUI() {
  if (genuiContainerEl) {
    genuiContainerEl.innerHTML = '';
  }
  lastGenUICall = null;
  setGenUIOpen(false);
  AvatarController.clearImage();
}

// Helper: Escape HTML strings safely
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --------------------------------------------------------------------------
// 1. PROJECTS OVERVIEW (Multi-Project Slate)
// --------------------------------------------------------------------------
function renderGenUIProjectsList(projects) {
  if (!projects || !Array.isArray(projects)) return;
  clearGenUI();
  lastGenUICall = { type: 'projects', payload: projects };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  const rowsHtml = projects.slice(0, 5).map((p, idx) => {
    let techs = p.techs || [];
    if (!Array.isArray(techs)) techs = [];
    const chipsHtml = techs.slice(0, 3).map(t => `<span class="slate-chip">${escapeHtml(t)}</span>`).join('');

    return `
      <div class="slate-project-item" data-project-idx="${idx}">
        <div class="slate-project-header">
          <span class="slate-project-num">0${idx + 1} //</span>
          <h4 class="slate-project-title">${escapeHtml(p.name)}</h4>
          <span class="slate-project-arrow">↗</span>
        </div>
        <p class="slate-project-summary">${escapeHtml(p.summary || '')}</p>
        <div class="slate-project-chips">${chipsHtml}</div>
      </div>
    `;
  }).join('<div class="slate-divider"></div>');

  slate.innerHTML = `
    <div class="slate-header">
      <span class="slate-tag">SPECIMEN // FEATURED SYSTEMS (0${Math.min(projects.length, 5)})</span>
      <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
    </div>
    
    <h3 class="slate-title">Engineered Pipelines</h3>
    <p class="slate-lead">Select any specimen below to inspect its architecture, latency, and capabilities.</p>
    
    <div class="slate-projects-list">${rowsHtml}</div>
  `;

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);

  slate.querySelectorAll('.slate-project-item').forEach((item) => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.projectIdx, 10);
      const proj = projects[idx];
      if (proj) {
        renderGenUIProjectBento(proj);
        sendUserQuery(`Tell me about your ${proj.name} project in detail`, true);
      }
    });
  });

  genuiContainerEl.appendChild(slate);
}

// --------------------------------------------------------------------------
// 2. SINGLE PROJECT SPECIMEN BENTO (Deep Dive)
// --------------------------------------------------------------------------
function renderGenUIProjectBento(project) {
  if (!project) return;
  clearGenUI();
  lastGenUICall = { type: 'project', payload: project };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  let modelsList = '';
  let frameworksList = '';
  if (project.technologies) {
    if (typeof project.technologies === 'object' && !Array.isArray(project.technologies)) {
      if (project.technologies.models) modelsList = project.technologies.models.join(' · ');
      if (project.technologies.frameworks) frameworksList = project.technologies.frameworks.join(' · ');
    } else if (Array.isArray(project.technologies)) {
      frameworksList = project.technologies.slice(0, 4).join(' · ');
    }
  }

  const features = project.features || project.architecture_concepts || [];
  const featuresListHtml = features.slice(0, 4).map(f => `<li>${escapeHtml(f)}</li>`).join('');

  let actionsHtml = '';
  if (project.github_url) {
    actionsHtml += `<a href="${escapeHtml(project.github_url)}" target="_blank" rel="noopener noreferrer" class="slate-btn primary">GitHub ↗</a>`;
  }
  if (project.live_link) {
    actionsHtml += `<a href="${escapeHtml(project.live_link)}" target="_blank" rel="noopener noreferrer" class="slate-btn secondary">Live Demo ↗</a>`;
  }

  slate.innerHTML = `
    <div class="slate-header">
      <span class="slate-tag">SPECIMEN // ${escapeHtml(project.type || 'VOICE AI').toUpperCase()}</span>
      <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
    </div>
    
    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
      <span class="slate-badge badge-live">● PRODUCTION</span>
      <span class="slate-badge badge-metric">&lt;400ms LATENCY</span>
    </div>

    <h3 class="slate-title">${escapeHtml(project.name)}</h3>
    <p class="slate-lead">${escapeHtml(project.summary || project.problem_statement || '')}</p>

    <div class="slate-ledger">
      <div class="ledger-row">
        <span class="ledger-key">STATUS</span>
        <span class="ledger-val">${escapeHtml(project.status || 'Completed / Deployed')}</span>
      </div>
      ${modelsList ? `
      <div class="ledger-row">
        <span class="ledger-key">INTELLIGENCE</span>
        <span class="ledger-val">${escapeHtml(modelsList)}</span>
      </div>` : ''}
      ${frameworksList ? `
      <div class="ledger-row">
        <span class="ledger-key">FRAMEWORKS</span>
        <span class="ledger-val">${escapeHtml(frameworksList)}</span>
      </div>` : ''}
      ${project.recent_git_activity ? `
      <div class="ledger-row" style="border-top: 1px dashed rgba(2,132,199,0.3); padding-top: 6px; margin-top: 4px;">
        <span class="ledger-key" style="color: #0284c7; font-weight: 600;">LATEST COMMIT</span>
        <span class="ledger-val" style="color: #111;">
          <strong>${escapeHtml(project.recent_git_activity.latest_commit_date)}</strong>: ${escapeHtml(project.recent_git_activity.latest_commit_message)}
        </span>
      </div>` : ''}
    </div>

    ${featuresListHtml ? `
    <div class="slate-section">
      <div class="slate-section-label">KEY CAPABILITIES</div>
      <ul class="slate-spec-list">${featuresListHtml}</ul>
    </div>` : ''}

    <div class="slate-actions-row">
      ${actionsHtml}
      <button type="button" class="slate-btn tertiary" id="backToProjectsBtn">← All Projects</button>
    </div>
  `;

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);
  const backBtn = slate.querySelector('#backToProjectsBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => sendUserQuery('Show me your featured projects'));
  }

  genuiContainerEl.appendChild(slate);
}

// --------------------------------------------------------------------------
// 3. SKILLS TAXONOMY MATRIX (4-Quadrant Bento)
// --------------------------------------------------------------------------
function renderGenUISkillsMatrix(quadrants) {
  if (!quadrants || !Array.isArray(quadrants)) return;
  clearGenUI();
  lastGenUICall = { type: 'skills', payload: quadrants };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  const groupsHtml = quadrants.map((q, idx) => `
    <div class="taxonomy-group">
      <div class="taxonomy-group-header">
        <span>0${idx + 1} //</span>
        <span>${escapeHtml(q.title.toUpperCase())}</span>
      </div>
      <div class="taxonomy-tags">
        ${(q.items || []).map(item => `
          <button class="slate-skill-tag" type="button" data-skill="${escapeHtml(item)}">${escapeHtml(item)}</button>
        `).join('')}
      </div>
    </div>
  `).join('<div class="slate-divider"></div>');

  slate.innerHTML = `
    <div class="slate-header">
      <span class="slate-tag">TAXONOMY // TECHNICAL PROFICIENCIES</span>
      <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
    </div>
    
    <h3 class="slate-title">Skills &amp; Architecture</h3>
    <p class="slate-lead">Interactive skill taxonomy. Click any technology to query real-world implementations.</p>
    
    <div class="slate-taxonomy-list">${groupsHtml}</div>
  `;

  slate.querySelectorAll('.slate-skill-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      sendUserQuery(`Tell me about your experience and production projects using ${tag.dataset.skill}`);
    });
  });

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);
  genuiContainerEl.appendChild(slate);
}

// --------------------------------------------------------------------------
// 4. CAREER EXPERIENCE CHRONOLOGY
// --------------------------------------------------------------------------
function renderGenUIExperienceTimeline(experience) {
  if (!experience) return;
  clearGenUI();
  lastGenUICall = { type: 'experience', payload: experience };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  let list = [];
  if (experience.professional_experience) {
    experience.professional_experience.forEach(p => {
      list.push({
        year: p.period || '2024 - Present',
        title: `${p.role} @ ${p.company}`,
        desc: p.description || ''
      });
    });
  } else if (experience.career_timeline) {
    experience.career_timeline.forEach(c => {
      list.push({ year: c.year, title: c.milestone, desc: c.description });
    });
  }

  const milestonesHtml = list.slice(0, 4).map((m, idx) => `
    <div class="slate-milestone-entry">
      <div class="milestone-meta-row">
        <span class="milestone-period">${escapeHtml(m.year)}</span>
        <span class="milestone-index">0${idx + 1}</span>
      </div>
      <h4 class="milestone-role">${escapeHtml(m.title)}</h4>
      <p class="milestone-narrative">${escapeHtml(m.desc)}</p>
    </div>
  `).join('<div class="slate-divider"></div>');

  slate.innerHTML = `
    <div class="slate-header">
      <span class="slate-tag">CHRONOLOGY // CAREER MILESTONES</span>
      <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
    </div>
    
    <h3 class="slate-title">Experience &amp; Track Record</h3>
    <p class="slate-lead">Professional history, voice AI specialization, and engineering impact.</p>
    
    <div class="slate-milestones-list">${milestonesHtml}</div>
  `;

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);
  genuiContainerEl.appendChild(slate);
}

// --------------------------------------------------------------------------
// 5. VERIFIED CERTIFICATIONS
// --------------------------------------------------------------------------
function renderGenUICertifications(certs, isSingleCert = false) {
  if (!certs) return;
  clearGenUI();
  lastGenUICall = { type: 'certifications', payload: certs, isSingleCert };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  const list = Array.isArray(certs) ? certs : (certs.certifications || certs.completed_certifications || [certs]);

  if (isSingleCert && list.length > 0) {
    const c = list[0];
    const certImg = c.image || '/static/assests/azure_ai_apps_and_agents_associate.png';
    const skillsHtml = (c.skills_gained || []).map(s => `<span class="slate-chip">${escapeHtml(s)}</span>`).join('');

    slate.innerHTML = `
      <div class="slate-header">
        <span class="slate-tag">ACCREDITATION // DIRECT SPECIFICATION</span>
        <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
      </div>
      
      <h3 class="slate-title">${escapeHtml(c.name || 'Verified Certification')}</h3>
      <div class="milestone-meta-row" style="margin-top: 4px; margin-bottom: 12px;">
        <span>${escapeHtml(c.provider || 'Accredited')} ${(c.earned_date || c.date) ? `· Earned ${escapeHtml(c.earned_date || c.date)}` : ''}</span>
        <span>${c.code ? escapeHtml(c.code) : 'VERIFIED'}</span>
      </div>

      <p class="slate-lead" style="font-size: 13.5px; line-height: 1.6; margin-bottom: 16px;">
        ${escapeHtml(c.importance || 'Official industry certification validating deep technical expertise and production delivery skills.')}
      </p>

      ${skillsHtml ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 8px;">Key Competencies</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">${skillsHtml}</div>
        </div>
      ` : ''}

      <div style="display: flex; gap: 12px; align-items: center; margin-top: 18px; flex-wrap: wrap;">
        ${(c.verify_url || c.link) ? `<a href="${escapeHtml(c.verify_url || c.link)}" target="_blank" rel="noopener noreferrer" class="slate-inline-link" style="font-size: 13px;">Official Credential Link ↗</a>` : ''}
        ${certImg ? `<button type="button" class="slate-inline-link show-on-tv-btn" data-image="${escapeHtml(certImg)}" data-title="${escapeHtml(c.name || '')}" style="background: none; border: none; padding: 0; cursor: pointer; font-size: 13px;">Lock on TV Screen ↗</button>` : ''}
      </div>
    `;
  } else {
    const certsHtml = list.slice(0, 4).map((c, idx) => {
      const certImg = c.image || null;
      return `
      <div class="slate-cert-entry">
        <div class="milestone-meta-row">
          <span>${escapeHtml(c.provider || c.issuer || 'Certified')} ${(c.earned_date || c.date) ? `· ${escapeHtml(c.earned_date || c.date)}` : ''}</span>
          <span>0${idx + 1}</span>
        </div>
        <h4 class="milestone-role">${escapeHtml(c.name || c.title)}</h4>
        <div style="display: flex; gap: 12px; align-items: center; margin-top: 6px; flex-wrap: wrap;">
          ${(c.verify_url || c.link) ? `<a href="${escapeHtml(c.verify_url || c.link)}" target="_blank" rel="noopener noreferrer" class="slate-inline-link">Verify Credential ↗</a>` : ''}
          ${certImg ? `<button type="button" class="slate-inline-link show-on-tv-btn" data-image="${escapeHtml(certImg)}" data-title="${escapeHtml(c.name || c.title)}" style="background: none; border: none; padding: 0; cursor: pointer;">Display on TV Screen ↗</button>` : ''}
        </div>
      </div>
    `;
    }).join('<div class="slate-divider"></div>');

    slate.innerHTML = `
      <div class="slate-header">
        <span class="slate-tag">CREDENTIALS // ACCREDITATIONS</span>
        <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
      </div>
      
      <h3 class="slate-title">Verified Certifications</h3>
      <p class="slate-lead">Cycling verified certificate images on the robot's TV monitor. Click any credential to display it directly.</p>
      
      <div class="slate-certs-list">${certsHtml}</div>
    `;
  }

  slate.querySelectorAll('.show-on-tv-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const imgUrl = btn.dataset.image || '/static/assests/azure_ai_apps_and_agents_associate.png';
      const title = btn.dataset.title || 'AZURE AI AGENTS ASSOCIATE';
      AvatarController.displayImage(imgUrl, title, true);
    });
  });

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);
  genuiContainerEl.appendChild(slate);
}

// 6. CONTACT INQUIRY SLATE (Agentic Dispatch)
// --------------------------------------------------------------------------
function renderGenUIContactModal() {
  clearGenUI();
  lastGenUICall = { type: 'contact', payload: null };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  slate.innerHTML = `
    <div class="slate-header">
      <span class="slate-tag">DISPATCH // AGENTIC INQUIRY</span>
      <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
    </div>
    
    <h3 class="slate-title">Inquire with Pradeep</h3>
    <p class="slate-lead">Dispatch your message directly via the voice agent pipeline, or connect across direct channels.</p>

    <form class="slate-form" id="contactAgentForm" autocomplete="off">
      <div class="slate-form-group">
        <label class="slate-form-label" for="contactSenderEmail">YOUR EMAIL ADDRESS</label>
        <input class="slate-input" id="contactSenderEmail" type="email" placeholder="name@company.com" required autocomplete="email" />
      </div>
      <div class="slate-form-group">
        <label class="slate-form-label" for="contactSenderMsg">MESSAGE OR INQUIRY</label>
        <textarea class="slate-textarea" id="contactSenderMsg" rows="2" placeholder="Hi Pradeep, I would like to discuss Voice AI / Agentic systems..." required></textarea>
      </div>
      <div class="slate-form-status" id="contactAgentStatus" role="status" aria-live="polite"></div>
      <div class="slate-actions-row" style="margin-top: 4px;">
        <button type="submit" class="slate-btn primary" id="contactDispatchBtn">Dispatch via Agent ↗</button>
        <button type="button" class="slate-btn secondary" id="contactResumeBtn">Request Resume ↗</button>
      </div>
    </form>

    <div class="slate-divider"></div>

    <div class="slate-ledger" style="margin-top: 10px; margin-bottom: 8px;">
      <div class="ledger-row">
        <span class="ledger-key">DIRECT EMAIL</span>
        <span class="ledger-val"><a href="mailto:selladuraipradeep@gmail.com" style="color: #111; text-decoration: underline;">selladuraipradeep@gmail.com</a></span>
      </div>
      <div class="ledger-row">
        <span class="ledger-key">LOCATION</span>
        <span class="ledger-val">India (Open to Global Remote)</span>
      </div>
      <div class="ledger-row">
        <span class="ledger-key">CHANNELS</span>
        <span class="ledger-val">
          <a href="https://www.linkedin.com/in/pradeepselladurai/" target="_blank" rel="noopener noreferrer" style="color: #0369a1; text-decoration: none; margin-right: 8px;">LinkedIn ↗</a>
          <a href="https://github.com/Cyberpradeep" target="_blank" rel="noopener noreferrer" style="color: #0369a1; text-decoration: none;">GitHub ↗</a>
        </span>
      </div>
    </div>
  `;

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);

  const contactForm = slate.querySelector('#contactAgentForm');
  const emailInput = slate.querySelector('#contactSenderEmail');
  const msgInput = slate.querySelector('#contactSenderMsg');
  const statusEl = slate.querySelector('#contactAgentStatus');
  const dispatchBtn = slate.querySelector('#contactDispatchBtn');
  const resumeBtn = slate.querySelector('#contactResumeBtn');

  function showStatus(text, type = 'info') {
    statusEl.textContent = text;
    statusEl.className = 'slate-form-status is-visible' + (type === 'error' ? ' is-error' : (type === 'success' ? ' is-success' : ''));
  }

  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = (emailInput.value || '').trim();
    const msg = (msgInput.value || '').trim();

    if (!email || !msg) {
      showStatus('Please provide both your email address and message.', 'error');
      return;
    }

    showStatus('Transmitting inquiry to voice agent pipeline...', 'info');
    dispatchBtn.disabled = true;
    dispatchBtn.style.opacity = '0.6';

    const agentPrompt = `Please send a contact email to Pradeep. My email is ${email} and my inquiry is: "${msg}"`;
    sendUserQuery(agentPrompt, true);

    setTimeout(() => {
      showStatus('Inquiry dispatched. The voice agent is processing your transmission.', 'success');
      dispatchBtn.disabled = false;
      dispatchBtn.style.opacity = '1';
    }, 1500);
  });

  resumeBtn.addEventListener('click', () => {
    const email = (emailInput.value || '').trim();
    if (!email) {
      showStatus('Please enter your email address above to receive Pradeep\'s resume.', 'error');
      emailInput.focus();
      return;
    }

    showStatus('Requesting resume transmission via agent...', 'info');
    resumeBtn.disabled = true;
    resumeBtn.style.opacity = '0.6';

    const resumePrompt = `Please send Pradeep's resume to my email: ${email}`;
    sendUserQuery(resumePrompt, true);

    setTimeout(() => {
      showStatus(`Resume dispatch requested for ${email}.`, 'success');
      resumeBtn.disabled = false;
      resumeBtn.style.opacity = '1';
    }, 1500);
  });

  genuiContainerEl.appendChild(slate);
}

// --------------------------------------------------------------------------
// 6. LIVE GITHUB ACTIVITY & OPEN SOURCE SLATE
// --------------------------------------------------------------------------
function renderGenUIGitHubActivity(payload) {
  if (!payload) return;
  clearGenUI();
  lastGenUICall = { type: 'github_activity', payload };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  const repos = payload.latest_repos || [];
  const openSource = payload.open_source_contributions || [];
  const pushes = payload.recent_pushes || [];

  const reposHtml = repos.slice(0, 4).map(r => `
    <div class="ledger-row" style="margin-bottom: 6px;">
      <span class="ledger-key" style="font-weight: 600; color: #111;">
        <a href="${escapeHtml(r.github_url)}" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: none;">
          ${escapeHtml(r.name)} ↗
        </a>
      </span>
      <span class="ledger-val" style="font-size: 11px;">
        <span class="slate-badge badge-metric" style="padding: 1px 6px; font-size: 10px;">${escapeHtml(r.language || 'Code')}</span>
        ${escapeHtml(r.pushed_at || '')}
      </span>
    </div>
  `).join('');

  const osHtml = openSource.length > 0 ? openSource.slice(0, 3).map(os => `
    <li style="margin-bottom: 4px;">
      <strong style="color: #0284c7;">${escapeHtml(os.type)}:</strong> 
      <a href="${escapeHtml(os.url || 'https://github.com/' + os.repo)}" target="_blank" rel="noopener noreferrer" style="color: #111; text-decoration: underline;">
        ${escapeHtml(os.repo)}
      </a>
      ${os.title ? `— <em>${escapeHtml(os.title.slice(0, 60))}...</em>` : ''}
      <span style="color: #888; font-size: 11px;">(${escapeHtml(os.date)})</span>
    </li>
  `).join('') : '<li>Active open-source contributor on GitHub</li>';

  const commitsHtml = pushes.slice(0, 3).map(p => `
    <div class="ledger-row">
      <span class="ledger-key" style="color: #555;">${escapeHtml(p.repo.replace('Cyberpradeep/', ''))}</span>
      <span class="ledger-val" style="font-size: 11px;"><strong>${escapeHtml(p.date)}</strong>: ${escapeHtml(p.latest_commit)}</span>
    </div>
  `).join('');

  slate.innerHTML = `
    <div class="slate-header">
      <span class="slate-tag">TELEMETRY // GITHUB REAL-TIME</span>
      <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
    </div>
    
    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
      <span class="slate-badge badge-live">● LIVE SYNCED</span>
      <span class="slate-badge badge-metric">@Cyberpradeep</span>
    </div>

    <h3 class="slate-title">Recent Code &amp; Contributions</h3>
    <p class="slate-lead">Real-time commit chronology and open-source contributions directly from GitHub.</p>

    ${reposHtml ? `
    <div class="slate-section" style="margin-top: 10px;">
      <div class="slate-section-label">ACTIVE REPOSITORIES (PUSH CHRONOLOGY)</div>
      <div class="slate-ledger">${reposHtml}</div>
    </div>` : ''}

    ${openSource.length > 0 ? `
    <div class="slate-section" style="margin-top: 10px;">
      <div class="slate-section-label">OPEN-SOURCE CONTRIBUTIONS</div>
      <ul class="slate-spec-list">${osHtml}</ul>
    </div>` : ''}

    ${commitsHtml ? `
    <div class="slate-section" style="margin-top: 10px;">
      <div class="slate-section-label">LATEST CODE COMMITS</div>
      <div class="slate-ledger">${commitsHtml}</div>
    </div>` : ''}

    <div class="slate-actions-row" style="margin-top: 16px;">
      <a href="https://github.com/Cyberpradeep" target="_blank" rel="noopener noreferrer" class="slate-btn primary">Visit GitHub Profile ↗</a>
      <button type="button" class="slate-btn tertiary" id="backToProjectsFromGitBtn">← View Projects</button>
    </div>
  `;

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);
  const backBtn = slate.querySelector('#backToProjectsFromGitBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => sendUserQuery('Show me your featured projects'));
  }

  genuiContainerEl.appendChild(slate);
}
// ==========================================================================
// EMBEDDED BACKGROUND THOUGHT STREAM — Architectural Wall Inscription
// ==========================================================================
const REASONING_SEQUENCES = [
  {
    tag: '[01 // CONTEXT ARCHITECTURE]',
    question: 'How do you stop context window explosion and token runaway during 15-minute voice sessions?',
    traceSteps: [
      '> profiling token velocity: 45 turns/session ≈ 72k tokens',
      ' → sliding-window compression summarizes turns older than T-6 into 180-token structured state digest',
      ' → tool definitions & system invariants pinned',
      ' → token footprint capped indefinitely at 4.2k tokens'
    ]
  },
  {
    tag: '[02 // AGENTIC DETERMINISM]',
    question: 'Why eliminate raw ReAct loops in multi-turn production agents?',
    traceSteps: [
      '> ReAct loops suffer 11.4% hallucinated termination failure',
      ' → agent retries idempotency violations in cyclic spirals',
      ' → replaced with hierarchical state machines: LLM handles node classification',
      ' → deterministic graph engine dictates valid transitions',
      ' → zero stuck-loop exceptions'
    ]
  },
  {
    tag: '[03 // REAL-TIME AUDIO PIPELINE]',
    question: 'How did you engineer sub-800ms speech turnaround over raw WebSockets in Voice AI?',
    traceSteps: [
      '> eliminated HTTP chunking latency',
      ' → bidirectional 16kHz PCM streaming over raw WebSockets',
      ' → client-side energy VAD with 350ms silence threshold triggers early speculative audio cutoff',
      ' → end-to-end turnaround dropped from 1450ms to 620ms'
    ]
  },
  {
    tag: '[04 // MCP TOOL ORCHESTRATION]',
    question: 'How does PizzaBot coordinate MCP tools across 20 timezones without hallucinating store hours?',
    traceSteps: [
      '> LLM arithmetic on UTC offsets produces 23% time hallucinations',
      ' → delegated to deterministic MCP tools',
      ' → agent extracts ISO-8601 intent',
      ' → tool queries local store schedule registry with tz-aware validation',
      ' → zero false opening hour commitments'
    ]
  }
];

let idleStreamTimer = null;
let idleStreamActive = false;
let idleTypingTimer = null;
let currentSequenceIdx = 0;
let idleInactivityTimer = null;
const IDLE_INACTIVITY_DELAY_MS = 22000; // 22 seconds of silence / idle time

function resetInactivityWatchdog() {
  if (idleInactivityTimer) {
    clearTimeout(idleInactivityTimer);
    idleInactivityTimer = null;
  }

  // Dismiss currently active thought stream if user is active
  if (idleStreamActive) {
    dismissIdleStream();
  }

  // If voice session is active, do not schedule idle stream
  if (isVoiceActive) return;

  // Schedule awakening after 22 seconds of pure inactivity
  idleInactivityTimer = setTimeout(() => {
    if (!isVoiceActive && !document.hidden) {
      startIdleReasoningStream();
    }
  }, IDLE_INACTIVITY_DELAY_MS);
}

function startIdleReasoningStream() {
  if (!idleStreamEl || !reasoningTraceEl || !thoughtReasoningWrapEl) return;
  if (idleStreamActive || isVoiceActive || document.body.classList.contains('has-genui-open')) return;

  idleStreamActive = true;
  runReasoningCycle();
}

function runReasoningCycle() {
  if (!idleStreamActive || isVoiceActive) return;

  const seq = REASONING_SEQUENCES[currentSequenceIdx];
  currentSequenceIdx = (currentSequenceIdx + 1) % REASONING_SEQUENCES.length;

  // Reset visual states
  if (thoughtIndexTagEl) thoughtIndexTagEl.textContent = seq.tag;
  if (thoughtReasoningWrapEl) thoughtReasoningWrapEl.classList.remove('is-hidden');
  if (reasoningTraceEl) reasoningTraceEl.textContent = '';
  if (reasoningCursorEl) reasoningCursorEl.classList.remove('is-hidden');

  // Reveal the thought container directly on the background wall
  idleStreamEl.classList.remove('is-dismissed');
  idleStreamEl.classList.add('is-active');

  // Step 1: Initial quiet pause (500ms) with blinking cursor before telemetry streams
  idleStreamTimer = setTimeout(() => {
    if (!idleStreamActive || isVoiceActive) return;

    // Step 2: Stream reasoning telemetry trace step-by-step with real-time thinking pauses
    streamReasoningSteps(reasoningTraceEl, seq.traceSteps, 0, () => {
      if (!idleStreamActive || isVoiceActive) return;

      // Finished streaming all steps: hide cursor
      if (reasoningCursorEl) reasoningCursorEl.classList.add('is-hidden');

      // Step 3: Hold contemplation for 9.5 seconds so user can comfortably read
      idleStreamTimer = setTimeout(() => {
        if (!idleStreamActive || isVoiceActive) return;

        // Fade out
        idleStreamEl.classList.remove('is-active');

        // Step 4: Calm resting gap (4.5s) before the next thought emerges
        idleStreamTimer = setTimeout(() => {
          if (!idleStreamActive || isVoiceActive) return;
          runReasoningCycle();
        }, 4500);
      }, 9500);
    });
  }, 500);
}

function typeString(targetEl, text, speedMs, onComplete) {
  let i = 0;
  function step() {
    if (!idleStreamActive) return;
    if (i < text.length) {
      targetEl.textContent += text[i];
      i++;
      idleTypingTimer = setTimeout(step, speedMs);
    } else {
      if (onComplete) onComplete();
    }
  }
  step();
}

function streamReasoningSteps(targetEl, steps, stepIdx, onComplete) {
  if (!idleStreamActive) return;
  if (!steps || stepIdx >= steps.length) {
    if (onComplete) onComplete();
    return;
  }

  const stepText = steps[stepIdx];
  // Stream this clause character-by-character at a deliberate speed (34ms per character)
  typeString(targetEl, stepText, 34, () => {
    if (!idleStreamActive) return;

    if (stepIdx < steps.length - 1) {
      // Thinking pause between deductions: stop typing, cursor blinks in place for 850ms
      idleTypingTimer = setTimeout(() => {
        if (!idleStreamActive) return;
        streamReasoningSteps(targetEl, steps, stepIdx + 1, onComplete);
      }, 850);
    } else {
      if (onComplete) onComplete();
    }
  });
}

function dismissIdleStream() {
  idleStreamActive = false;
  if (idleStreamTimer) { clearTimeout(idleStreamTimer); idleStreamTimer = null; }
  if (idleTypingTimer) { clearTimeout(idleTypingTimer); idleTypingTimer = null; }
  if (idleStreamEl) {
    idleStreamEl.classList.add('is-dismissed');
    idleStreamEl.classList.remove('is-active');
  }
}



// ==========================================================================
// QUERY DISPATCHER
// ==========================================================================
function sendUserQuery(text, preserveGenUI = false) {
  const query = (text || '').trim();
  if (!query) return;

  handleNewUserTurn(query, preserveGenUI);

  // If voice is already engaged and websocket is disconnected, keep voice active
  if (isVoiceActive && !geminiClient.isConnected()) {
    geminiClient.connect();
  }

  // Send typed query to backend (routes to Gemini Live voice if active, or Groq text agent if idle)
  async function postQuery(attempt = 1) {
    try {
      const res = await fetch('/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: query,
          session_id: geminiClient.sessionId
        })
      });
      if (res.status === 409 && attempt < 3) {
        console.warn(`[TEXT] Retrying in 1s (attempt ${attempt}/3)...`);
        setTimeout(() => postQuery(attempt + 1), 1000);
      } else if (res.ok) {
        const data = await res.json();
        // Fallback in case SSE channel is disconnected or lagged
        if (data && data.response && activeStatementEl && activeStatementEl.textContent === 'Synthesizing response...') {
          handleAssistantStreamChunk(data.response, true);
          AvatarController.setAvatarState('idle');
        }
      } else {
        console.error('[TEXT] Error sending query:', res.status, res.statusText);
      }
    } catch (err) {
      console.error('[TEXT] Network error sending query:', err);
      if (attempt < 3) {
        setTimeout(() => postQuery(attempt + 1), 1200);
      }
    }
  }

  postQuery();
}

// ==========================================================================
// VOICE BUTTON UI STATE
// ==========================================================================
function updateVoiceButtonUI(isPaused = false) {
  if (!talkBtn) return;

  if (isVoiceActive) {
    hasEverEngaged = true;
    talkBtn.classList.add('is-active');
    talkBtn.classList.remove('is-standby');
    if (talkBtnTextEl) {
      talkBtnTextEl.textContent = 'Live Dialogue';
    }
  } else {
    talkBtn.classList.remove('is-active');
    if (isPaused || hasEverEngaged) {
      talkBtn.classList.add('is-standby');
      if (talkBtnTextEl) {
        talkBtnTextEl.textContent = 'Resume Voice';
      }
    } else {
      talkBtn.classList.remove('is-standby');
      if (talkBtnTextEl) {
        talkBtnTextEl.textContent = 'Talk with Twin';
      }
    }
  }
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================
function setupEventListeners() {
  // --- Session Ignition: Unlocking audio and initiating auto-greet ---
  window.addEventListener('session:unlock_audio', () => {
    console.log('[AUTOGREET] AudioContext unlocked via user gesture');
    mediaHandler.initializeAudio();
  });

  window.addEventListener('session:start_greet', async () => {
    console.log('[AUTOGREET] Connecting to Gemini Live session for auto-greeting...');
    mediaHandler.initializeAudio();

    // Voice-first: activate voice session and set button to ON immediately
    isVoiceActive = true;
    updateVoiceButtonUI();
    setDockMode('voice');

    if (!geminiClient.isConnected()) {
      geminiClient.connect();
    }

    AvatarController.setAvatarState('listening');
    if (activeStatementEl) {
      activeStatementEl.textContent = "Initializing Neural Voice Twin...";
      activeStatementEl.classList.remove('is-medium-text', 'is-long-text');
    }

    try {
      await mediaHandler.startAudio((pcm16Data) => {
        if (geminiClient.isConnected()) {
          geminiClient.sendAudio(pcm16Data);
        }
      });
    } catch (err) {
      console.warn('[MIC] Auto-start mic waiting for user permission:', err);
    }
  });

  // --- Mode Switching (Voice ⇄ Text) ---
  if (switchToTextBtn) {
    switchToTextBtn.addEventListener('click', () => {
      // Pause voice Gemini session cleanly when switching to text
      if (isVoiceActive || (geminiClient && geminiClient.isConnected())) {
        isVoiceActive = false;
        mediaHandler.stopAudio();
        mediaHandler.stopAudioPlayback();
        geminiClient.disconnect();
        AvatarController.setAvatarState('idle');
        AvatarController.setSpeaking(false);
        updateVoiceButtonUI(true); // Flag as paused -> button shows "Resume Voice" in warm amber
      }
      setDockMode('text');
    });
  }

  if (switchToVoiceBtn) {
    switchToVoiceBtn.addEventListener('click', async () => {
      setDockMode('voice');
      // Resume voice dialogue cleanly
      if (!isVoiceActive) {
        dismissPromptSparks();
        isVoiceActive = true;
        updateVoiceButtonUI();
        if (!geminiClient.isConnected()) {
          geminiClient.connect();
        }
        AvatarController.setAvatarState('listening');
        try {
          await mediaHandler.startAudio((pcm16Data) => {
            if (geminiClient.isConnected()) {
              geminiClient.sendAudio(pcm16Data);
            }
          });
        } catch (err) {
          console.error('[MIC] Failed to resume audio on switch to voice:', err);
          isVoiceActive = false;
          updateVoiceButtonUI();
          AvatarController.setAvatarState('idle');
        }
      }
    });
  }

  // --- Voice-to-Voice Toggle ---
  if (talkBtn) {
    talkBtn.addEventListener('click', async () => {
      mediaHandler.initializeAudio(); // Unlock audio on user interaction
      setDockMode('voice');
      if (!isVoiceActive) {
        // Engaging voice session
        dismissPromptSparks();
        isVoiceActive = true;
        updateVoiceButtonUI();
        if (!geminiClient.isConnected()) {
          geminiClient.connect();
        }
        AvatarController.setAvatarState('listening');
        try {
          await mediaHandler.startAudio((pcm16Data) => {
            if (geminiClient.isConnected()) {
              geminiClient.sendAudio(pcm16Data);
            }
          });
        } catch (err) {
          console.error('[MIC] Failed to start audio:', err);
          isVoiceActive = false;
          updateVoiceButtonUI();
          AvatarController.setAvatarState('idle');
          resetInactivityWatchdog();
          if (activeStatementEl) {
            activeStatementEl.textContent = 'Microphone access was denied or not supported. You can still type your questions in the box below!';
          }
        }
      } else {
        // Disengaging voice session (user paused or stopped)
        isVoiceActive = false;
        mediaHandler.stopAudio();
        mediaHandler.stopAudioPlayback();
        geminiClient.disconnect();
        AvatarController.setAvatarState('idle');
        updateVoiceButtonUI();
        resetInactivityWatchdog();
      }
    });
  }

  // --- Text Input (Polished UX) ---
  if (sendBtn && textInputEl) {
    const syncSendBtnState = () => {
      const hasText = textInputEl.value.trim().length > 0;
      sendBtn.disabled = !hasText;
      sendBtn.classList.toggle('is-disabled', !hasText);
      sendBtn.classList.toggle('is-ready', hasText);
    };

    textInputEl.addEventListener('input', syncSendBtnState);
    syncSendBtnState();

    sendBtn.addEventListener('click', () => {
      const query = textInputEl.value.trim();
      if (!query) return;
      sendUserQuery(query);
      textInputEl.value = '';
      syncSendBtnState();
    });

    textInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const query = textInputEl.value.trim();
        if (!query) return;
        sendUserQuery(query);
        textInputEl.value = '';
        syncSendBtnState();
      }
    });
  }

  // --- Contact Modal ---
  if (contactModalBtn) {
    contactModalBtn.addEventListener('click', () => {
      renderGenUIContactModal();
    });
  }

  // --- Inactivity Watchdog: Start 22s countdown only after 3D stage is ready ---
  window.addEventListener('stage:ready', () => {
    resetInactivityWatchdog();
  });

  // Fallback if avatar was already initialized & dismissed
  const loadingOverlayEl = document.getElementById('loadingOverlay');
  if (loadingOverlayEl && loadingOverlayEl.classList.contains('is-hidden')) {
    resetInactivityWatchdog();
  }

  // --- Global User Activity Watchdog (any click/key/tap resets idle timer) ---
  window.addEventListener('pointerdown', resetInactivityWatchdog, { passive: true });
  window.addEventListener('keydown', resetInactivityWatchdog, { passive: true });
  window.addEventListener('touchstart', resetInactivityWatchdog, { passive: true });


  // --- Interactive Click-to-Query on Skill Chips & Specimen Rows ---
  if (genuiContainerEl) {
    genuiContainerEl.addEventListener('click', (e) => {
      const skillTag = e.target.closest('.slate-skill-tag');
      if (skillTag) {
        const skillName = skillTag.textContent.trim();
        sendUserQuery(`Tell me about your experience with ${skillName}`);
        return;
      }

      const projectItem = e.target.closest('.slate-project-item');
      if (projectItem && !e.target.closest('a') && !e.target.closest('button')) {
        const titleEl = projectItem.querySelector('.slate-project-title');
        if (titleEl) {
          const projName = titleEl.textContent.trim();
          sendUserQuery(`Tell me more details about ${projName}`);
        }
      }
    });
  }

  // --- Minimalist Prompt Sparks (Agentic Conversational Starters) ---
  if (promptSparksEl) {
    promptSparksEl.addEventListener('click', (e) => {
      const sparkChip = e.target.closest('.spark-chip');
      if (sparkChip) {
        const query = sparkChip.getAttribute('data-query') || sparkChip.textContent.trim();
        dismissPromptSparks();
        sendUserQuery(query);
      }
    });
  }




  // --- Mobile Virtual Keyboard Viewport Height Tracker ---
  if (window.visualViewport) {
    const handleVisualViewportResize = () => {
      const vh = window.visualViewport.height;
      document.documentElement.style.setProperty('--viewport-height', `${vh}px`);
    };
    window.visualViewport.addEventListener('resize', handleVisualViewportResize);
    window.visualViewport.addEventListener('scroll', handleVisualViewportResize);
    handleVisualViewportResize();
  }

  // --- Click Outside to Dismiss GenUI Slate ---
  document.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('has-genui-open')) return;
    // Don't close if clicked inside the GenUI container or on navigation/dock controls
    if (e.target.closest('#genuiContainer') || 
        e.target.closest('.bottom-dock') || 
        e.target.closest('.topbar') || 
        e.target.closest('#convHistory')) {
      return;
    }
    clearGenUI();
  });

  // --- Global Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearGenUI();
    }
  });
}

// Start
window.displayCertification = () => {
  AvatarController.displayImage('/static/assests/azure_ai_apps_and_agents_associate.png', 'AZURE AI AGENTS ASSOCIATE');
};

document.addEventListener('DOMContentLoaded', init);
