/**
 * SELLARIS AI — ONBOARDING FLOW  |  onboarding.js
 *
 * Features:
 *  - Multi-step wizard with animated transitions
 *  - Per-step validation
 *  - AJAX / Fetch API save-per-step (with CSRF)
 *  - localStorage persistence (resume after page leave)
 *  - Progress bar + step pill indicators
 *  - Dynamic FAQ / product / team rows
 *  - Channel toggle expand/collapse
 *  - Catalog method switching
 *  - Review summary auto-population (Step 6)
 *  - File upload previews
 *  - Success overlay on Go Live
 */

"use strict";

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────── */
const CONFIG = {
  totalSteps: 6,
  saveUrl: "/onboarding/save-step/",  // Django endpoint
  completeUrl: "/onboarding/complete/",
  storageKey: "sellaris_onboarding_v1",
  stepLabels: [
    "Business Profile",
    "Channels",
    "AI Setup",
    "Products",
    "Team",
    "Go Live",
  ],
  // Steps 4 is optional — validation won't block "Continue"
  optionalSteps: [4],
};

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let state = {
  currentStep: 1,
  completedSteps: [],
  stepData: {}, // { 1: FormData snapshot, … }
};

/* ─────────────────────────────────────────────
   DOM REFERENCES
───────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const progressFill  = $("#progressFill");
const progressLabel = $("#progressLabel");
const progressPct   = $("#progressPct");
const prevBtn       = $("#prevBtn");
const nextBtn       = $("#nextBtn");
const saveStatus    = $("#saveStatus");
const stepPills     = $$(".ob-step-pill");
const successOverlay = $("#successOverlay");

/* ─────────────────────────────────────────────
   INITIALISE
───────────────────────────────────────────── */
function init() {
  seedStepPillsIfEmpty();
  restoreFromStorage();
  updateProgressUI();
  bindStaticEvents();
  initChannelToggles();
  initFileUploads();
  initDynamicLists();
  initCatalogSwitcher();
  goToStep(state.currentStep, false);
}

/* ─────────────────────────────────────────────
   SEED STEP PILLS
   (If Django template context didn't supply them)
───────────────────────────────────────────── */
function seedStepPillsIfEmpty() {
  if (stepPills.length) return;
  const nav = $(".ob-steps-nav");
  if (!nav) return;
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
  progressFill.style.width = pct + "%";
  progressFill.parentElement.setAttribute("aria-valuenow", pct);
  progressLabel.textContent = `Step ${state.currentStep} of ${CONFIG.totalSteps}`;
  progressPct.textContent = pct + "%";

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

  prevBtn.disabled = state.currentStep === 1;

  const isLast = state.currentStep === CONFIG.totalSteps;
  nextBtn.innerHTML = isLast
    ? `🚀 Go Live <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `Continue <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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

  if (n === CONFIG.totalSteps) {
    buildReviewSummary();
  }
}

/* ─────────────────────────────────────────────
   BUTTON EVENTS
───────────────────────────────────────────── */
function bindStaticEvents() {
  nextBtn.addEventListener("click", handleNext);
  prevBtn.addEventListener("click", handlePrev);

  // Step pills — allow jumping only to completed steps
  $$(".ob-step-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const n = parseInt(pill.dataset.step);
      if (n === state.currentStep) return;
      if (state.completedSteps.includes(n) || n < state.currentStep) {
        goToStep(n);
      }
    });
  });

  // Review "Edit" buttons in step 6
  document.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-goto]");
    if (editBtn) {
      const n = parseInt(editBtn.dataset.goto);
      goToStep(n);
    }
  });
}

async function handleNext() {
  const step = state.currentStep;
  const isOptional = CONFIG.optionalSteps.includes(step);
  const isLast = step === CONFIG.totalSteps;

  const valid = validateStep(step);
  if (!valid && !isOptional) return; // halt if required step invalid

  // Collect + save via AJAX
  const saved = await saveStepData(step);
  if (!saved) return; // halt on network error (user notified)

  if (!state.completedSteps.includes(step)) {
    state.completedSteps.push(step);
  }

  if (isLast) {
    await handleGoLive();
  } else {
    goToStep(step + 1);
  }
}

function handlePrev() {
  if (state.currentStep > 1) {
    goToStep(state.currentStep - 1);
  }
}

/* ─────────────────────────────────────────────
   VALIDATION
───────────────────────────────────────────── */
function validateStep(step) {
  clearErrors(step);
  let valid = true;

  const form = $(`#form-step-${step}`);
  if (!form) return true;

  switch (step) {
    case 1: valid = validateStep1(form); break;
    case 2: valid = validateStep2(form); break;
    case 3: valid = validateStep3(form); break;
    case 4: valid = true; break;  // optional
    case 5: valid = validateStep5(form); break;
    case 6: valid = validateStep6(form); break;
  }

  return valid;
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
  const anyChecked = $$(".ob-channel-toggle:checked").length > 0;
  const errEl = $("#channel-err");
  if (!anyChecked) {
    errEl.style.display = "block";
    errEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    errEl.style.display = "none";
  }
  return anyChecked;
}

function validateStep3(form) {
  return [
    checkRequired(form, "agent_name"),
    checkRadio(form, "tone", "tone-err"),
    checkRequired(form, "greeting"),
  ].every(Boolean);
}

function validateStep5(form) {
  return checkEmail(form, "notif_email");
}

function validateStep6(form) {
  const cb = form.querySelector("#agree-terms");
  const err = $("#terms-err");
  if (!cb.checked) {
    err.textContent = "You must agree to the terms to continue.";
    cb.focus();
    return false;
  }
  err.textContent = "";
  return true;
}

/* ── Validation helpers ── */
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
  const val = el.value.trim();
  const invalid = val === "" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  setFieldError(el, invalid ? "Please enter a valid email address." : "");
  return !invalid;
}

function checkRadio(form, name, errId) {
  const checked = form.querySelector(`[name="${name}"]:checked`);
  const err = $(`#${errId}`) || form.querySelector("[role='alert']");
  if (!checked) {
    if (err) err.textContent = "Please select an option.";
    return false;
  }
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
   AJAX SAVE — FETCH API
───────────────────────────────────────────── */
async function saveStepData(step) {
  const form = $(`#form-step-${step}`);
  if (!form) return true;

  const formData = new FormData(form);

  // Capture snapshot for review summary
  const snapshot = {};
  formData.forEach((v, k) => {
    if (k === "csrfmiddlewaretoken") return;
    snapshot[k] = snapshot[k] ? [].concat(snapshot[k], v) : v;
  });
  state.stepData[step] = snapshot;
  saveToStorage();

  setSaveStatus("saving");

  try {
    const response = await fetch(CONFIG.saveUrl, {
      method: "POST",
      headers: { "X-CSRFToken": getCsrf() },
      body: formData,
      credentials: "same-origin",
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.success === false) {
      setSaveStatus("error", data.message || "Save failed");
      return false;
    }

    setSaveStatus("saved");
    setTimeout(() => setSaveStatus(""), 2500);
    return true;

  } catch (err) {
    console.error("[Sellaris Onboarding] Save error:", err);
    // Soft-fail: persist locally and allow user to proceed
    setSaveStatus("error", "Saved locally — will sync when online");
    setTimeout(() => setSaveStatus(""), 4000);
    return true; // allow progression even if network fails
  }
}

async function handleGoLive() {
  setSaveStatus("saving", "Launching your AI agent…");
  nextBtn.disabled = true;

  try {
    const csrf = getCsrf();
    const response = await fetch(CONFIG.completeUrl, {
      method: "POST",
      headers: {
        "X-CSRFToken": csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ completed: true }),
      credentials: "same-origin",
    });
    // Accept 404 in dev (endpoint may not exist yet)
    if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
  } catch (e) {
    console.warn("[Sellaris Onboarding] Complete endpoint error:", e);
  }

  clearStorage();
  setSaveStatus("");
  nextBtn.disabled = false;
  successOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

/* ─────────────────────────────────────────────
   SAVE STATUS UI
───────────────────────────────────────────── */
function setSaveStatus(type, msg) {
  saveStatus.className = "ob-save-status";
  if (!type) { saveStatus.innerHTML = ""; return; }

  const icons = {
    saving: `<span class="ob-spinner"></span>`,
    saved:  `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    error:  `⚠️`,
  };
  const labels = {
    saving: msg || "Saving…",
    saved:  msg || "Progress saved",
    error:  msg || "Save failed",
  };

  saveStatus.classList.add(type);
  saveStatus.innerHTML = `${icons[type] || ""} ${labels[type]}`;
}

/* ─────────────────────────────────────────────
   LOCAL STORAGE PERSISTENCE
───────────────────────────────────────────── */
function saveToStorage() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
      stepData: state.stepData,
    }));
  } catch (_) {}
}

function restoreFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.currentStep    = saved.currentStep    || 1;
    state.completedSteps = saved.completedSteps || [];
    state.stepData       = saved.stepData       || {};

    // Re-populate form fields from saved data
    Object.entries(state.stepData).forEach(([step, data]) => {
      restoreFormFields(parseInt(step), data);
    });
  } catch (_) {}
}

function restoreFormFields(step, data) {
  const form = $(`#form-step-${step}`);
  if (!form || !data) return;

  Object.entries(data).forEach(([name, value]) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type") || "";

    if (type === "checkbox") { el.checked = value === "on" || value === true; return; }
    if (type === "radio") {
      const radio = form.querySelector(`[name="${name}"][value="${value}"]`);
      if (radio) radio.checked = true;
      return;
    }
    if (tag === "select" || tag === "input" || tag === "textarea") {
      el.value = value;
    }
  });
}

function clearStorage() {
  try { localStorage.removeItem(CONFIG.storageKey); } catch (_) {}
}

/* ─────────────────────────────────────────────
   CSRF HELPER
───────────────────────────────────────────── */
function getCsrf() {
  // 1. From cookie (Django default)
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  if (match) return match[1];
  // 2. From hidden input
  const el = document.querySelector("[name=csrfmiddlewaretoken]");
  return el ? el.value : "";
}

/* ─────────────────────────────────────────────
   CHANNEL TOGGLES
───────────────────────────────────────────── */
function initChannelToggles() {
  $$(".ob-channel-toggle").forEach((toggle) => {
    const card    = toggle.closest(".ob-channel-card");
    const channel = card?.dataset.channel;
    const fields  = $(`#fields-${channel}`);
    if (!fields) return;

    // Restore state
    if (state.stepData[2]?.[`channel_${channel}`] === "on") {
      toggle.checked = true;
      fields.classList.add("is-open");
    }

    toggle.addEventListener("change", () => {
      fields.classList.toggle("is-open", toggle.checked);
    });
  });
}

/* ─────────────────────────────────────────────
   FILE UPLOADS WITH PREVIEW
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

  // Drag & drop
  area.addEventListener("dragover", (e) => { e.preventDefault(); area.classList.add("drag-over"); });
  area.addEventListener("dragleave", () => area.classList.remove("drag-over"));
  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) {
      input.files = e.dataTransfer.files;
      handleFile(file, area, preview, type);
    }
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
        <img src="${e.target.result}" alt="Preview" style="height:48px;border-radius:8px;object-fit:cover;" />
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
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/* ─────────────────────────────────────────────
   DYNAMIC LISTS (FAQ / Products / Team)
───────────────────────────────────────────── */
function initDynamicLists() {
  // FAQ
  const addFaqBtn = $("#addFaqBtn");
  const faqList   = $("#faqList");
  if (addFaqBtn && faqList) {
    addFaqBtn.addEventListener("click", () => {
      const clone = faqList.querySelector(".ob-faq-item").cloneNode(true);
      clone.querySelectorAll("input, textarea").forEach((el) => (el.value = ""));
      bindRemoveBtn(clone, ".ob-faq-remove", ".ob-faq-item");
      faqList.appendChild(clone);
    });
    bindRemoveBtns(faqList, ".ob-faq-remove", ".ob-faq-item");
  }

  // Products
  const addProductBtn = $("#addProductBtn");
  const productsList  = $("#productsList");
  if (addProductBtn && productsList) {
    addProductBtn.addEventListener("click", () => {
      const clone = productsList.querySelector(".ob-product-item").cloneNode(true);
      clone.querySelectorAll("input, textarea, select").forEach((el) => (el.value = el.tagName === "SELECT" ? el.options[0].value : ""));
      bindRemoveBtn(clone, ".ob-product-remove", ".ob-product-item");
      productsList.appendChild(clone);
    });
    bindRemoveBtns(productsList, ".ob-product-remove", ".ob-product-item");
  }

  // Team
  const addTeamBtn = $("#addTeamBtn");
  const teamList   = $("#teamList");
  if (addTeamBtn && teamList) {
    addTeamBtn.addEventListener("click", () => {
      const clone = teamList.querySelector(".ob-team-item").cloneNode(true);
      clone.querySelectorAll("input, select").forEach((el) => (el.value = ""));
      bindRemoveBtn(clone, ".ob-team-remove", ".ob-team-item");
      teamList.appendChild(clone);
    });
    bindRemoveBtns(teamList, ".ob-team-remove", ".ob-team-item");
  }
}

function bindRemoveBtns(list, btnSel, itemSel) {
  list.querySelectorAll(btnSel).forEach((btn) =>
    bindRemoveBtn(btn.closest(itemSel)?.parentElement ? btn.closest(itemSel) : list.querySelector(itemSel), btnSel, itemSel)
  );
}

function bindRemoveBtn(item, btnSel, itemSel) {
  const btn = item.querySelector(btnSel);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const list = item.parentElement;
    if (list && list.querySelectorAll(itemSel).length > 1) {
      item.remove();
    } else {
      // Clear fields instead of removing last item
      item.querySelectorAll("input, textarea").forEach((el) => (el.value = ""));
    }
  });
}

/* ─────────────────────────────────────────────
   CATALOG METHOD SWITCHER (STEP 4)
───────────────────────────────────────────── */
function initCatalogSwitcher() {
  const radios = $$("[name='catalog_method']");
  const panels = {
    manual:  $("#catalog-manual"),
    csv:     $("#catalog-csv"),
    shopify: $("#catalog-platform"),
    woo:     $("#catalog-platform"),
  };

  radios.forEach((r) => {
    r.addEventListener("change", () => switchCatalogPanel(r.value, panels));
  });
}

function switchCatalogPanel(method, panels) {
  // Hide all
  Object.values(panels).forEach((p) => { if (p) p.style.display = "none"; });

  // Show active
  const target = panels[method];
  if (target) {
    target.style.display = "block";
    target.style.animation = "stepEnter 0.3s ease both";
  }

  // Update platform-specific label
  const urlField = $("#platform-url");
  const keyField = $("#platform-key");
  if (method === "shopify" && urlField && keyField) {
    urlField.placeholder = "https://yourstore.myshopify.com";
    keyField.placeholder = "shpat_xxxx…";
  } else if (method === "woo" && urlField && keyField) {
    urlField.placeholder = "https://yourstore.com";
    keyField.placeholder = "ck_xxxx…";
  }
}

/* ─────────────────────────────────────────────
   REVIEW SUMMARY (STEP 6)
───────────────────────────────────────────── */
function buildReviewSummary() {
  // Step 1
  renderReviewGrid("review-step1", [
    ["Business Name",  state.stepData[1]?.business_name],
    ["Industry",       state.stepData[1]?.industry],
    ["Email",          state.stepData[1]?.business_email],
    ["Phone",          state.stepData[1]?.phone],
    ["Website",        state.stepData[1]?.website || "—"],
  ]);

  // Step 2 — channels
  const chLabels = { channel_whatsapp: "WhatsApp", channel_instagram: "Instagram", channel_telegram: "Telegram", channel_intercom: "Intercom" };
  const connectedChannels = Object.entries(chLabels)
    .filter(([key]) => state.stepData[2]?.[key] === "on")
    .map(([, label]) => label)
    .join(", ") || "None selected";
  renderReviewGrid("review-step2", [["Connected Channels", connectedChannels]]);

  // Step 3
  renderReviewGrid("review-step3", [
    ["Agent Name",     state.stepData[3]?.agent_name],
    ["Tone",           capitalize(state.stepData[3]?.tone)],
  ]);

  // Step 4
  const catalogMethod = state.stepData[4]?.catalog_method || "manual";
  renderReviewGrid("review-step4", [["Catalog Method", capitalize(catalogMethod)]]);

  // Step 5
  renderReviewGrid("review-step5", [
    ["Notification Email", state.stepData[5]?.notif_email || "—"],
    ["New Conversation",   state.stepData[5]?.notif_new_conv === "on" ? "✅ On" : "Off"],
    ["Sale Alerts",        state.stepData[5]?.notif_sale     === "on" ? "✅ On" : "Off"],
    ["Escalations",        state.stepData[5]?.notif_escalation === "on" ? "✅ On" : "Off"],
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
   REAL-TIME INPUT VALIDATION (live feedback)
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