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
const contactModalBtn = document.getElementById('contactModalBtn');

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
  if (activeStatementEl && !activeStatementEl.textContent.includes('Re-engage')) {
    pushToHistory(activeStatementEl.textContent);
    activeStatementEl.textContent = 'Voice dialogue is standing by. Click "Re-engage Voice" or choose a prompt to continue.';
    activeStatementEl.classList.remove('is-medium-text', 'is-long-text');
  }
}

const geminiClient = new GeminiClient({
  autoConnect: false,
  onOpen: () => {
    console.log('[WS] Connected to /audio');
    AvatarController.setAvatarState('idle');
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
  }
});

// ==========================================================================
// SSE /events — TOOL/GENUI BROADCAST CHANNEL
// ==========================================================================
let eventSource = null;
function setupEventSource() {
  if (eventSource) return;
  try {
    eventSource = new EventSource('/events');
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
  if (!clean || clean === 'Thinking...' || clean === '...') return;

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

function handleNewUserTurn(userQuery, preserveGenUI = false) {
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
    activeStatementEl.textContent = 'Thinking...';
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

    // Auto-scroll stream container to stay focused on active tokens
    if (convActiveEl && convActiveEl.scrollHeight > convActiveEl.clientHeight) {
      convActiveEl.scrollTop = convActiveEl.scrollHeight;
    }

    AvatarController.updateTranscript(currentStreamingChunk);
  }
}

// ==========================================================================
// SERVER PAYLOAD HANDLER
// ==========================================================================
function handleServerPayload(payload) {
  if (!payload || !payload.type) return;

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
      if (payload.experience) {
        renderGenUIExperienceTimeline(payload.experience);
      }
      break;

    case 'show_certifications':
      if (payload.certifications) {
        renderGenUICertifications(payload.certifications);
        const list = Array.isArray(payload.certifications) ? payload.certifications : (payload.certifications.completed_certifications || []);
        const firstWithImg = list.find(c => c.image) || list[0];
        const imgUrl = payload.active_image || (firstWithImg && firstWithImg.image) || '/static/assests/Screenshot 2026-09-06 131836.png';
        const title = (firstWithImg && (firstWithImg.name || firstWithImg.title)) || 'AZURE AI AGENTS ASSOCIATE';
        AvatarController.displayImage(imgUrl, title);
      }
      break;

    case 'open_link':
      if (payload.url) {
        console.log('[OPEN_LINK] Opening URL:', payload.url);
        let win = null;
        try {
          win = window.open(payload.url, '_blank', 'noopener,noreferrer');
        } catch (err) {
          console.warn('[OPEN_LINK] window.open error:', err);
        }

        // Anchor dispatch attempt
        if (!win || win.closed || typeof win.closed === 'undefined') {
          try {
            const a = document.createElement('a');
            a.href = payload.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } catch (_) {}
        }
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
  } else {
    document.body.classList.remove('has-genui-open');
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
function renderGenUICertifications(certs) {
  if (!certs) return;
  clearGenUI();
  lastGenUICall = { type: 'certifications', payload: certs };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  const list = Array.isArray(certs) ? certs : (certs.certifications || certs.completed_certifications || []);
  const certsHtml = list.slice(0, 4).map((c, idx) => {
    const certImg = c.image || (c.name && c.name.toLowerCase().includes('azure') ? '/static/assests/Screenshot 2026-09-06 131836.png' : null);
    return `
    <div class="slate-cert-entry">
      <div class="milestone-meta-row">
        <span>${escapeHtml(c.provider || c.issuer || 'Certified')} ${c.date ? `· ${escapeHtml(c.date)}` : ''}</span>
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
    <p class="slate-lead">Accredited engineering proficiencies in AI and Cloud architectures.</p>
    
    <div class="slate-certs-list">${certsHtml}</div>
  `;

  slate.querySelectorAll('.show-on-tv-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const imgUrl = btn.dataset.image || '/static/assests/Screenshot 2026-09-06 131836.png';
      const title = btn.dataset.title || 'AZURE AI AGENTS ASSOCIATE';
      AvatarController.displayImage(imgUrl, title);
    });
  });

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);
  genuiContainerEl.appendChild(slate);
}

// --------------------------------------------------------------------------
// 6. CONTACT INQUIRY SLATE
// --------------------------------------------------------------------------
function renderGenUIContactModal() {
  clearGenUI();
  lastGenUICall = { type: 'contact', payload: null };
  setGenUIOpen(true);

  const slate = document.createElement('div');
  slate.className = 'studio-slate slate-stagger';

  slate.innerHTML = `
    <div class="slate-header">
      <span class="slate-tag">INQUIRY // GET IN TOUCH</span>
      <button class="slate-close-btn" type="button" aria-label="Close">ESC ×</button>
    </div>
    
    <h3 class="slate-title">Connect with Pradeep</h3>
    <p class="slate-lead">Direct communications for engineering collaboration, voice AI consulting, and opportunities.</p>

    <div class="slate-ledger">
      <div class="ledger-row">
        <span class="ledger-key">EMAIL</span>
        <span class="ledger-val">selladuraipradeep@gmail.com</span>
      </div>
      <div class="ledger-row">
        <span class="ledger-key">LOCATION</span>
        <span class="ledger-val">India (Open to Global Remote)</span>
      </div>
      <div class="ledger-row">
        <span class="ledger-key">SPECIALIZATION</span>
        <span class="ledger-val">Voice AI · Agentic Systems</span>
      </div>
    </div>

    <div class="slate-actions-row">
      <a href="mailto:selladuraipradeep@gmail.com" class="slate-btn primary">Send Email ↗</a>
      <a href="https://www.linkedin.com/in/pradeepselladurai/" target="_blank" rel="noopener noreferrer" class="slate-btn secondary">LinkedIn ↗</a>
      <a href="https://github.com/Cyberpradeep" target="_blank" rel="noopener noreferrer" class="slate-btn secondary">GitHub ↗</a>
    </div>
  `;

  slate.querySelector('.slate-close-btn').addEventListener('click', clearGenUI);
  genuiContainerEl.appendChild(slate);
}

// ==========================================================================
// QUERY DISPATCHER
// ==========================================================================
function sendUserQuery(text, preserveGenUI = false) {
  const query = (text || '').trim();
  if (!query) return;

  mediaHandler.initializeAudio(); // Ensure AudioContext is active
  handleNewUserTurn(query, preserveGenUI);

  // If WebSocket is disconnected, trigger connection immediately
  if (!geminiClient.isConnected()) {
    geminiClient.connect();
  }

  // Send typed query with automatic retry while session initializes
  async function postQuery(attempt = 1) {
    try {
      const res = await fetch('/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: query })
      });
      if (res.status === 409 && attempt < 3) {
        console.warn(`[TEXT] Audio session initializing, retrying in 1s (attempt ${attempt}/3)...`);
        geminiClient.connect();
        setTimeout(() => postQuery(attempt + 1), 1000);
      } else if (!res.ok) {
        console.error('[TEXT] Error sending query:', res.status, res.statusText);
      }
    } catch (err) {
      console.error('[TEXT] Network error sending query:', err);
      if (attempt < 3) {
        geminiClient.connect();
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
        talkBtnTextEl.textContent = 'Re-engage Voice';
      }
    } else {
      talkBtn.classList.remove('is-standby');
      if (talkBtnTextEl) {
        talkBtnTextEl.textContent = 'Engage Voice Twin';
      }
    }
  }
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================
function setupEventListeners() {
  // --- Voice-to-Voice Toggle ---
  if (talkBtn) {
    talkBtn.addEventListener('click', async () => {
      mediaHandler.initializeAudio(); // Unlock audio on user interaction
      if (!isVoiceActive) {
        // Engaging voice session
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
          if (activeStatementEl) {
            activeStatementEl.textContent = 'Microphone access was denied or not supported. You can still type your questions in the box below!';
          }
        }
      } else {
        // Disengaging voice session
        isVoiceActive = false;
        mediaHandler.stopAudio();
        mediaHandler.stopAudioPlayback();
        geminiClient.disconnect();
        AvatarController.setAvatarState('idle');
        updateVoiceButtonUI();
      }
    });
  }

  // --- Text Input ---
  if (sendBtn && textInputEl) {
    sendBtn.addEventListener('click', () => {
      sendUserQuery(textInputEl.value);
      textInputEl.value = '';
    });

    textInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendUserQuery(textInputEl.value);
        textInputEl.value = '';
      }
    });
  }

  // --- Contact Modal ---
  if (contactModalBtn) {
    contactModalBtn.addEventListener('click', () => {
      renderGenUIContactModal();
    });
  }



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
  AvatarController.displayImage('/static/assests/Screenshot 2026-09-06 131836.png', 'AZURE AI AGENTS ASSOCIATE');
};

document.addEventListener('DOMContentLoaded', init);
