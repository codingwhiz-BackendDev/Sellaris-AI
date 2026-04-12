/**
 * SELLARIS AI — ONBOARDING FLOW  |  onboarding.js
 */

"use strict";

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────── */
const CONFIG = {
  totalSteps: 6,
  saveUrl: "/onboarding/save-step",
  completeUrl: "/onboarding/complete",
  channelStatusUrl: "/channels/status",
  channelConnectUrl: (ch) => `/channels/connect/${ch}`,
  channelDisconnectUrl: (ch) => `/channels/disconnect/${ch}`,
  storageKey: "sellaris_onboarding_v1",
  stepLabels: ["Business Profile","Channels","AI Setup","Products","Team","Go Live"],
  optionalSteps: [4],
  channels: ["whatsapp", "instagram", "telegram", "intercom"],
};

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let state = {
  currentStep: 1,
  completedSteps: [],
  stepData: {},
  connectedChannels: [],
};

/* ─────────────────────────────────────────────
   DOM HELPERS
───────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const progressFill   = $("#progressFill");
const progressLabel  = $("#progressLabel");
const progressPct    = $("#progressPct");
const prevBtn        = $("#prevBtn");
const nextBtn        = $("#nextBtn");
const saveStatus     = $("#saveStatus");
const successOverlay = $("#successOverlay");

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
function init() {
  injectChannelStyles();
  seedStepPillsIfEmpty();
  restoreFromStorage();
  updateProgressUI();
  bindStaticEvents();
  initFileUploads();
  initDynamicLists();
  initCatalogSwitcher();
  checkOAuthReturn();
  goToStep(state.currentStep, false);
}

/* ─────────────────────────────────────────────
   SEED STEP PILLS
───────────────────────────────────────────── */
function seedStepPillsIfEmpty() {
  const nav = $(".ob-steps-nav");
  if (!nav || nav.children.length) return;
  CONFIG.stepLabels.forEach((label, i) => {
    const btn = document.createElement("button");
    btn.className = "ob-step-pill";
    btn.dataset.step = i + 1;
    btn.type = "button";
    btn.setAttribute("aria-label", `Step ${i + 1}: ${label}`);
    btn.innerHTML = `
      <span class="ob-step-pill__num">${i + 1}</span>
      <span class="ob-step-pill__check">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="ob-step-pill__label">${label}</span>`;
    nav.appendChild(btn);
  });
}

/* ─────────────────────────────────────────────
   PROGRESS UI
───────────────────────────────────────────── */
function updateProgressUI() {
  const pct = Math.round(((state.currentStep - 1) / CONFIG.totalSteps) * 100);
  if (progressFill) {
    progressFill.style.width = pct + "%";
    progressFill.parentElement.setAttribute("aria-valuenow", pct);
  }
  if (progressLabel) progressLabel.textContent = `Step ${state.currentStep} of ${CONFIG.totalSteps}`;
  if (progressPct)   progressPct.textContent   = pct + "%";

  $$(".ob-step-pill").forEach((pill) => {
    const n = parseInt(pill.dataset.step);
    pill.classList.remove("is-active", "is-done");
    pill.setAttribute("aria-current", "false");
    if (n === state.currentStep) {
      pill.classList.add("is-active");
      pill.setAttribute("aria-current", "step");
    } else if (state.completedSteps.includes(n)) {
      pill.classList.add("is-done");
    }
  });

  if (prevBtn) prevBtn.disabled = state.currentStep === 1;

  const isLast = state.currentStep === CONFIG.totalSteps;
  if (nextBtn) {
    nextBtn.innerHTML = isLast
      ? `🚀 Go Live <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `Continue <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}

/* ─────────────────────────────────────────────
   STEP NAVIGATION
───────────────────────────────────────────── */
function goToStep(targetStep, animate = true) {
  const current = $(`#step-${state.currentStep}`);
  const target  = $(`#step-${targetStep}`);
  if (!target) return;

  if (animate && current && targetStep !== state.currentStep) {
    current.classList.add("is-exiting");
    setTimeout(() => {
      current.classList.remove("is-active", "is-exiting");
      activateStep(target, targetStep);
    }, 280);
  } else {
    if (current) current.classList.remove("is-active");
    activateStep(target, targetStep);
  }
}

function activateStep(el, n) {
  el.classList.add("is-active");
  state.currentStep = n;
  updateProgressUI();
  saveToStorage();
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (n === 2) loadChannelStatuses();
  if (n === CONFIG.totalSteps) buildReviewSummary();
}

/* ─────────────────────────────────────────────
   BUTTON EVENTS
───────────────────────────────────────────── */
function bindStaticEvents() {
  if (nextBtn) nextBtn.addEventListener("click", handleNext);
  if (prevBtn) prevBtn.addEventListener("click", handlePrev);

  $$(".ob-step-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const n = parseInt(pill.dataset.step);
      if (n === state.currentStep) return;
      if (state.completedSteps.includes(n) || n < state.currentStep) goToStep(n);
    });
  });

  document.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-goto]");
    if (editBtn) goToStep(parseInt(editBtn.dataset.goto));
  });
}

async function handleNext() {
  const step       = state.currentStep;
  const isOptional = CONFIG.optionalSteps.includes(step);
  const isLast     = step === CONFIG.totalSteps;

  const valid = validateStep(step);
  if (!valid && !isOptional) return;

  const saved = await saveStepData(step);
  if (!saved) return;

  if (!state.completedSteps.includes(step)) state.completedSteps.push(step);

  if (isLast) await handleGoLive();
  else goToStep(step + 1);
}

function handlePrev() {
  if (state.currentStep > 1) goToStep(state.currentStep - 1);
}

/* ─────────────────────────────────────────────
   VALIDATION
───────────────────────────────────────────── */
function validateStep(step) {
  clearErrors(step);
  const form = $(`#form-step-${step}`);
  if (!form) return true;
  switch (step) {
    case 1: return validateStep1(form);
    case 2: return validateStep2();
    case 3: return validateStep3(form);
    case 4: return true;
    case 5: return validateStep5(form);
    case 6: return validateStep6(form);
    default: return true;
  }
}

function validateStep1(form) {
  return [
    checkRequired(form, "business_name"),
    checkRequired(form, "industry"),
    checkEmail(form, "business_email"),
    checkRequired(form, "phone"),
    checkRequired(form, "description"),
  ].every(Boolean);
}

function validateStep2() {
  const hasConnected = state.connectedChannels.length > 0;
  const errEl = $("#channel-err");
  if (errEl) {
    errEl.style.display = hasConnected ? "none" : "block";
    if (!hasConnected) errEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  return hasConnected;
}

function validateStep3(form) {
  return [
    checkRequired(form, "agent_name"),
    checkRadio(form, "tone", "tone-err"),
    checkRequired(form, "greeting"),
  ].every(Boolean);
}

function validateStep5(form) { return checkEmail(form, "notif_email"); }

function validateStep6(form) {
  const cb  = form.querySelector("#agree-terms");
  const err = $("#terms-err");
  if (!cb || !cb.checked) {
    if (err) err.textContent = "You must agree to the terms to continue.";
    if (cb)  cb.focus();
    return false;
  }
  if (err) err.textContent = "";
  return true;
}

function checkRequired(form, name) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el) return true;
  const empty = el.value.trim() === "";
  setFieldError(el, empty ? "This field is required." : "");
  return !empty;
}

function checkEmail(form, name) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el) return true;
  const val     = el.value.trim();
  const invalid = val === "" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  setFieldError(el, invalid ? "Please enter a valid email address." : "");
  return !invalid;
}

function checkRadio(form, name, errId) {
  const checked = form.querySelector(`[name="${name}"]:checked`);
  const err     = $(`#${errId}`) || form.querySelector("[role='alert']");
  if (!checked) { if (err) err.textContent = "Please select an option."; return false; }
  if (err) err.textContent = "";
  return true;
}

function setFieldError(el, msg) {
  const err = el.closest(".ob-field")?.querySelector(".ob-err");
  if (err) err.textContent = msg;
  el.classList.toggle("is-invalid", !!msg);
}

function clearErrors(step) {
  const section = $(`#step-${step}`);
  if (!section) return;
  $$(".ob-err", section).forEach((el) => (el.textContent = ""));
  $$(".is-invalid", section).forEach((el) => el.classList.remove("is-invalid"));
  const chanErr = $("#channel-err");
  if (chanErr) chanErr.style.display = "none";
}

/* ─────────────────────────────────────────────
   CHANNEL OAUTH
───────────────────────────────────────────── */
async function loadChannelStatuses() {
  CONFIG.channels.forEach((ch) => renderChannelButton(ch, "loading"));

  try {
    const resp = await fetch(CONFIG.channelStatusUrl, {
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    CONFIG.channels.forEach((ch) => renderChannelButton(ch, "disconnected"));
    state.connectedChannels = [];

    (data.channels || []).forEach((ch) => {
      renderChannelButton(ch.channel, ch.status, ch);
      if (ch.status === "connected") state.connectedChannels.push(ch.channel);
    });
  } catch (e) {
    console.error("[Sellaris] Could not load channel statuses:", e);
    CONFIG.channels.forEach((ch) => renderChannelButton(ch, "disconnected"));
  }
}

function renderChannelButton(channel, status, data = {}) {
  const container = $(`#status-${channel}`);
  if (!container) return;
  const card = $(`#card-${channel}`);

  if (status === "loading") {
    container.innerHTML = `
      <span style="font-size:0.78rem;color:var(--text3);display:flex;align-items:center;gap:6px;">
        <span class="ob-spinner" style="border-top-color:var(--text3);width:12px;height:12px;"></span>
        Loading…
      </span>`;
    return;
  }

  if (status === "connected") {
    if (card) card.classList.add("is-connected");
    const handle = data.phone_number || data.handle || "";
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="ch-badge ch-badge--connected">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Connected${handle ? " · " + handle : ""}
        </span>
        <button class="ch-btn ch-btn--disconnect" type="button"
                onclick="disconnectChannel('${channel}')">
          Disconnect
        </button>
      </div>`;
  } else {
    if (card) card.classList.remove("is-connected");
    const label = channel === "telegram" ? "Add Bot" : "Connect";
    container.innerHTML = `
      <button class="ch-btn ch-btn--connect" type="button"
              onclick="connectChannel('${channel}')">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        ${label}
      </button>`;
  }
}

window.connectChannel = function (channel) {
  if (channel === "telegram") { openTelegramWidget(); return; }

  const w    = 620, h = 720;
  const left = Math.round((screen.width  - w) / 2);
  const top  = Math.round((screen.height - h) / 2);

  const popup = window.open(
    CONFIG.channelConnectUrl(channel),
    `sellaris_connect_${channel}`,
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );

  if (!popup) {
    showToast("⚠️ Popup blocked — please allow popups for this site.", "error");
    return;
  }

  renderChannelButton(channel, "loading");

  const timer = setInterval(() => {
    try {
      if (popup.closed) {
        clearInterval(timer);
        loadChannelStatuses();
      }
    } catch (_) {}
  }, 600);
};

function openTelegramWidget() {
  fetch(CONFIG.channelConnectUrl("telegram"), { credentials: "same-origin" })
    .then((r) => r.json())
    .then((data) => {
      if (data.method !== "telegram_widget") return;

      const modal = document.createElement("div");
      modal.id = "tg-modal";
      modal.style.cssText = `
        position:fixed;inset:0;background:rgba(7,9,15,0.88);
        backdrop-filter:blur(12px);z-index:500;
        display:flex;align-items:center;justify-content:center;padding:24px;`;
      modal.innerHTML = `
        <div style="background:#0f1628;border:1px solid rgba(79,127,255,0.3);
                    border-radius:20px;padding:40px;max-width:380px;width:100%;
                    text-align:center;position:relative;">
          <button onclick="document.getElementById('tg-modal').remove()"
            style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.06);
                   border:1px solid rgba(255,255,255,0.1);color:var(--text2);
                   border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;">✕</button>
          <div style="font-size:44px;margin-bottom:16px;">✈️</div>
          <h3 style="font-family:var(--font-d);font-size:1.25rem;margin-bottom:8px;">Connect Telegram</h3>
          <p style="font-size:0.875rem;color:var(--text2);margin-bottom:28px;line-height:1.65;">
            Click below to log in with Telegram and authorise Sellaris AI to manage your bot.
          </p>
          <div id="tg-widget-container"></div>
        </div>`;
      document.body.appendChild(modal);

      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login", data.bot_username);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-auth-url", data.callback_url);
      script.setAttribute("data-request-access", "write");
      script.async = true;
      $("#tg-widget-container").appendChild(script);
    })
    .catch(() => showToast("Could not load Telegram widget. Try again.", "error"));
}

window.disconnectChannel = async function (channel) {
  const name = capitalize(channel);
  if (!confirm(`Disconnect ${name}? Your AI agent will stop responding on this platform.`)) return;

  renderChannelButton(channel, "loading");

  try {
    await fetch(CONFIG.channelDisconnectUrl(channel), {
      method: "POST",
      headers: { "X-CSRFToken": getCsrf(), "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
    });
  } catch (e) {
    console.error("[Sellaris] Disconnect error:", e);
  }

  state.connectedChannels = state.connectedChannels.filter((c) => c !== channel);
  renderChannelButton(channel, "disconnected");
  showToast(`${name} disconnected.`, "info");
};

function checkOAuthReturn() {
  const params    = new URLSearchParams(window.location.search);
  const connected = params.get("connected");
  const error     = params.get("error");
  const step      = parseInt(params.get("step") || "0");

  if (connected || error || step) {
    window.history.replaceState({}, "", window.location.pathname);
  }

  if (connected) {
    showToast(`✅ ${capitalize(connected)} connected successfully!`, "success");
    if (step === 2) state.currentStep = 2;
  }

  if (error) {
    const messages = {
      invalid_state:        "Security check failed. Please try again.",
      token_exchange_failed:"Could not get access token. Please try again.",
      access_denied:        "You cancelled the connection.",
    };
    showToast(`❌ ${messages[error] || "Connection failed: " + error}`, "error");
  }
}

/* ─────────────────────────────────────────────
   TOAST
───────────────────────────────────────────── */
function showToast(message, type = "success") {
  const existing = $("#sellaris-toast");
  if (existing) existing.remove();

  const colors = {
    success: { bg:"rgba(52,211,153,0.12)", border:"rgba(52,211,153,0.35)", text:"#34d399" },
    error:   { bg:"rgba(248,113,113,0.12)", border:"rgba(248,113,113,0.35)", text:"#f87171" },
    info:    { bg:"rgba(79,127,255,0.12)", border:"rgba(79,127,255,0.35)", text:"#4F7FFF" },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement("div");
  toast.id = "sellaris-toast";
  toast.style.cssText = `
    position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
    background:${c.bg};border:1px solid ${c.border};color:${c.text};
    padding:12px 24px;border-radius:999px;
    font-size:0.875rem;font-weight:600;font-family:var(--font-d, 'Syne', sans-serif);
    backdrop-filter:blur(14px);z-index:600;white-space:nowrap;
    box-shadow:0 8px 32px rgba(0,0,0,0.3);
    animation:toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ─────────────────────────────────────────────
   INJECT STYLES
───────────────────────────────────────────── */
function injectChannelStyles() {
  if ($("#sellaris-injected-styles")) return;
  const style = document.createElement("style");
  style.id = "sellaris-injected-styles";
  style.textContent = `
    @keyframes toastIn {
      from { opacity:0; transform:translateX(-50%) translateY(16px); }
      to   { opacity:1; transform:translateX(-50%) translateY(0); }
    }
    .ch-btn {
      display:inline-flex; align-items:center; gap:6px;
      padding:9px 18px; border-radius:999px;
      font-family:var(--font-d,'Syne',sans-serif); font-weight:700; font-size:0.8rem;
      border:none; cursor:pointer;
      transition:0.25s cubic-bezier(0.4,0,0.2,1); white-space:nowrap;
    }
    .ch-btn--connect {
      background:linear-gradient(135deg,#4F7FFF,#7C3AED); color:#fff;
      box-shadow:0 0 18px rgba(79,127,255,0.3);
    }
    .ch-btn--connect:hover { transform:translateY(-2px) scale(1.03); box-shadow:0 0 28px rgba(79,127,255,0.5); }
    .ch-btn--disconnect {
      background:transparent; color:#f87171; border:1px solid rgba(248,113,113,0.3);
    }
    .ch-btn--disconnect:hover { background:rgba(248,113,113,0.1); }
    .ch-badge {
      display:inline-flex; align-items:center; gap:5px;
      padding:6px 12px; border-radius:999px;
      font-family:var(--font-d,'Syne',sans-serif); font-size:0.78rem; font-weight:700;
    }
    .ch-badge--connected {
      background:rgba(52,211,153,0.12); border:1px solid rgba(52,211,153,0.3); color:#34d399;
    }
    .ob-channel-card.is-connected {
      border-color:rgba(52,211,153,0.3) !important;
      background:rgba(52,211,153,0.03) !important;
    }
  `;
  document.head.appendChild(style);
}

/* ─────────────────────────────────────────────
   AJAX SAVE
───────────────────────────────────────────── */
async function saveStepData(step) {
  const form = $(`#form-step-${step}`);
  if (!form) return true;

  const formData = new FormData(form);
  formData.append("step", step);
  const snapshot = {};
  formData.forEach((v, k) => {
    if (k === "csrfmiddlewaretoken") return;
    snapshot[k] = snapshot[k] ? [].concat(snapshot[k], v) : v;
  });
  state.stepData[step] = snapshot;
  saveToStorage();
  setSaveStatus("saving");

  try {
    const resp = await fetch(CONFIG.saveUrl, {
      method: "POST",
      headers: { "X-CSRFToken": getCsrf() },
      body: formData,
      credentials: "same-origin",
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.success === false) { setSaveStatus("error", data.message || "Save failed"); return false; }
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus(""), 2500);
    return true;
  } catch (err) {
    console.error("[Sellaris] Save error:", err);
    setSaveStatus("error", "Saved locally — will sync when online");
    setTimeout(() => setSaveStatus(""), 4000);
    return true;
  }
}

async function handleGoLive() {
  setSaveStatus("saving", "Launching your AI agent…");
  if (nextBtn) nextBtn.disabled = true;

  try {
    const resp = await fetch(CONFIG.completeUrl, {
      method: "POST",
      headers: { "X-CSRFToken": getCsrf(), "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
      credentials: "same-origin",
    });
    if (!resp.ok && resp.status !== 404) throw new Error(`HTTP ${resp.status}`);
  } catch (e) {
    console.warn("[Sellaris] Complete endpoint error:", e);
  }

  clearStorage();
  setSaveStatus("");
  if (nextBtn) nextBtn.disabled = false;
  if (successOverlay) {
    successOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }
}

/* ─────────────────────────────────────────────
   SAVE STATUS
───────────────────────────────────────────── */
function setSaveStatus(type, msg) {
  if (!saveStatus) return;
  saveStatus.className = "ob-save-status";
  if (!type) { saveStatus.innerHTML = ""; return; }
  const icons  = { saving:`<span class="ob-spinner"></span>`, saved:`✓`, error:`⚠️` };
  const labels = { saving:msg||"Saving…", saved:msg||"Progress saved", error:msg||"Save failed" };
  saveStatus.classList.add(type);
  saveStatus.innerHTML = `${icons[type]||""} ${labels[type]}`;
}

/* ─────────────────────────────────────────────
   LOCAL STORAGE
───────────────────────────────────────────── */
function saveToStorage() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
      stepData: state.stepData,
      connectedChannels: state.connectedChannels,
    }));
  } catch (_) {}
}

function restoreFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.currentStep       = saved.currentStep       || 1;
    state.completedSteps    = saved.completedSteps    || [];
    state.stepData          = saved.stepData          || {};
    state.connectedChannels = saved.connectedChannels || [];
    Object.entries(state.stepData).forEach(([step, data]) => restoreFormFields(parseInt(step), data));
  } catch (_) {}
}

function restoreFormFields(step, data) {
  const form = $(`#form-step-${step}`);
  if (!form || !data) return;
  Object.entries(data).forEach(([name, value]) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return;
    const type = el.getAttribute("type") || "";
    if (type === "checkbox") { el.checked = value === "on" || value === true; return; }
    if (type === "radio") {
      const radio = form.querySelector(`[name="${name}"][value="${value}"]`);
      if (radio) radio.checked = true;
      return;
    }
    el.value = value;
  });
}

function clearStorage() {
  try { localStorage.removeItem(CONFIG.storageKey); } catch (_) {}
}

/* ─────────────────────────────────────────────
   CSRF
───────────────────────────────────────────── */
function getCsrf() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  if (match) return match[1];
  const el = document.querySelector("[name=csrfmiddlewaretoken]");
  return el ? el.value : "";
}

/* ─────────────────────────────────────────────
   FILE UPLOADS
───────────────────────────────────────────── */
function initFileUploads() {
  setupUpload("biz-logo", "logoUploadArea", "logoPreview", "image");
  setupUpload("faq-doc",  "faqUploadArea",  "faqPreview",  "file");
}

function setupUpload(inputId, areaId, previewId, type) {
  const input   = $(`#${inputId}`);
  const area    = $(`#${areaId}`);
  const preview = $(`#${previewId}`);
  if (!input || !area) return;
  input.addEventListener("change", () => handleFile(input.files[0], area, preview, type));
  area.addEventListener("dragover",  (e) => { e.preventDefault(); area.classList.add("drag-over"); });
  area.addEventListener("dragleave", ()  => area.classList.remove("drag-over"));
  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) { input.files = e.dataTransfer.files; handleFile(file, area, preview, type); }
  });
}

function handleFile(file, area, preview, type) {
  if (!file || !preview) return;
  const inner = area.querySelector(".ob-upload__inner");
  preview.hidden = false;
  if (type === "image" && file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `
        <img src="${e.target.result}" alt="Preview" style="height:48px;border-radius:8px;object-fit:cover;"/>
        <div style="flex:1">
          <div style="font-size:0.82rem;font-weight:600;color:var(--green);">✓ ${file.name}</div>
          <div style="font-size:0.72rem;color:var(--text3);">${formatSize(file.size)}</div>
        </div>
        <button type="button" onclick="removeUpload('${area.id}','${preview.id}')"
          style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;">✕</button>`;
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = `
      <span style="font-size:20px;">📄</span>
      <div style="flex:1">
        <div style="font-size:0.82rem;font-weight:600;color:var(--green);">✓ ${file.name}</div>
        <div style="font-size:0.72rem;color:var(--text3);">${formatSize(file.size)}</div>
      </div>
      <button type="button" onclick="removeUpload('${area.id}','${preview.id}')"
        style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;">✕</button>`;
  }
  if (inner) inner.style.display = "none";
}

window.removeUpload = function (areaId, previewId) {
  const area    = $(`#${areaId}`);
  const preview = $(`#${previewId}`);
  const inner   = area?.querySelector(".ob-upload__inner");
  const input   = area?.querySelector("input[type=file]");
  if (input)   input.value = "";
  if (preview) { preview.hidden = true; preview.innerHTML = ""; }
  if (inner)   inner.style.display = "";
};

function formatSize(bytes) {
  if (bytes < 1024)    return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/* ─────────────────────────────────────────────
   DYNAMIC LISTS
───────────────────────────────────────────── */
function initDynamicLists() {
  setupList("addFaqBtn",     "faqList",      ".ob-faq-item",     ".ob-faq-remove");
  setupList("addProductBtn", "productsList", ".ob-product-item", ".ob-product-remove");
  setupList("addTeamBtn",    "teamList",     ".ob-team-item",    ".ob-team-remove");
}

function setupList(addBtnId, listId, itemSel, removeBtnSel) {
  const addBtn = $(`#${addBtnId}`);
  const list   = $(`#${listId}`);
  if (!addBtn || !list) return;

  list.querySelectorAll(removeBtnSel).forEach((btn) => {
    bindRemoveBtn(btn.closest(itemSel), itemSel, removeBtnSel, list);
  });

  addBtn.addEventListener("click", () => {
    const template = list.querySelector(itemSel);
    if (!template) return;
    const clone = template.cloneNode(true);
    clone.querySelectorAll("input, textarea, select").forEach((el) => {
      el.value = el.tagName === "SELECT" ? el.options[0]?.value || "" : "";
    });
    bindRemoveBtn(clone, itemSel, removeBtnSel, list);
    list.appendChild(clone);
  });
}

function bindRemoveBtn(item, itemSel, removeBtnSel, list) {
  const btn = item?.querySelector(removeBtnSel);
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (list.querySelectorAll(itemSel).length > 1) item.remove();
    else item.querySelectorAll("input, textarea").forEach((el) => (el.value = ""));
  });
}

/* ─────────────────────────────────────────────
   CATALOG SWITCHER
───────────────────────────────────────────── */
function initCatalogSwitcher() {
  const radios = $$("[name='catalog_method']");
  const panels = {
    manual: $("#catalog-manual"), csv: $("#catalog-csv"),
    shopify: $("#catalog-platform"), woo: $("#catalog-platform"),
  };
  radios.forEach((r) => r.addEventListener("change", () => switchCatalogPanel(r.value, panels)));
}

function switchCatalogPanel(method, panels) {
  Object.values(panels).forEach((p) => { if (p) p.style.display = "none"; });
  const target = panels[method];
  if (target) target.style.display = "block";
  const urlField = $("#platform-url");
  const keyField = $("#platform-key");
  if (urlField) urlField.placeholder = method === "woo" ? "https://yourstore.com" : "https://yourstore.myshopify.com";
  if (keyField) keyField.placeholder = method === "woo" ? "ck_xxxx…" : "shpat_xxxx…";
}

/* ─────────────────────────────────────────────
   REVIEW SUMMARY
───────────────────────────────────────────── */
function buildReviewSummary() {
  renderReviewGrid("review-step1", [
    ["Business Name", state.stepData[1]?.business_name],
    ["Industry",      state.stepData[1]?.industry],
    ["Email",         state.stepData[1]?.business_email],
    ["Phone",         state.stepData[1]?.phone],
    ["Website",       state.stepData[1]?.website || "—"],
  ]);
  renderReviewGrid("review-step2", [
    ["Connected Channels", state.connectedChannels.map(capitalize).join(", ") || "None"],
  ]);
  renderReviewGrid("review-step3", [
    ["Agent Name", state.stepData[3]?.agent_name],
    ["Tone",       capitalize(state.stepData[3]?.tone)],
  ]);
  renderReviewGrid("review-step4", [
    ["Catalog Method", capitalize(state.stepData[4]?.catalog_method || "manual")],
  ]);
  renderReviewGrid("review-step5", [
    ["Notification Email", state.stepData[5]?.notif_email || "—"],
    ["New Conversation",   state.stepData[5]?.notif_new_conv   === "on" ? "✅ On" : "Off"],
    ["Sale Alerts",        state.stepData[5]?.notif_sale        === "on" ? "✅ On" : "Off"],
    ["Escalations",        state.stepData[5]?.notif_escalation  === "on" ? "✅ On" : "Off"],
  ]);
}

function renderReviewGrid(containerId, rows) {
  const el = $(`#${containerId}`);
  if (!el) return;
  el.innerHTML = rows.map(([key, val]) => `
    <div class="ob-review-row">
      <span class="ob-review-key">${key}</span>
      <span class="ob-review-val">${val || "—"}</span>
    </div>`).join("");
}

function capitalize(str) {
  if (!str) return "—";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ─────────────────────────────────────────────
   LIVE VALIDATION
───────────────────────────────────────────── */
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.classList.contains("ob-input") || !el.required) return;
  const isEmpty = el.value.trim() === "";
  el.classList.toggle("is-invalid", isEmpty);
  const errEl = el.closest(".ob-field")?.querySelector(".ob-err");
  if (errEl) errEl.textContent = isEmpty ? "This field is required." : "";
}, { passive: true });

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}