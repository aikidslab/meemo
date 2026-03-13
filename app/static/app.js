let mediaRecorder = null, audioChunks = [], stream = null;
let timerInterval = null, timerSeconds = 0;
let currentMinutes = "", currentFilename = "";
let user = null;
let currentWizardStep = 1;
let allTemplates = [], allLanguages = [];
let editingTemplateId = null;
const CUSTOM_TEMPLATES_KEY = "custom_templates_v1";

// ── Init ─────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  await loadUser();
  await loadTemplates();

  const groq = localStorage.getItem("groq_key");
  if (!groq) {
    showWizardAt(1);
  } else {
    showMainApp();
  }
});

// ── Wizard ────────────────────────────────────────────────────
function showWizardAt(step) {
  document.getElementById("setup-wizard").classList.remove("hidden");
  document.getElementById("main-app").classList.add("hidden");
  goToStep(step);

  // Pre-fill existing values
  document.getElementById("groq-key-input").value = localStorage.getItem("groq_key") || "";
}

function goToStep(n) {
  currentWizardStep = n;
  [1, 2].forEach(i => {
    document.getElementById(`step-${i}`).classList.toggle("hidden", i !== n);
    const dot = document.getElementById(`dot-${i}`);
    dot.classList.remove("active", "done");
    if (i < n) dot.classList.add("done");
    else if (i === n) dot.classList.add("active");
  });
}

function nextStep(from) {
  if (from === 1) {
    const key = document.getElementById("groq-key-input").value.trim();
    if (!key) { shakeInput("groq-key-input"); return; }
    localStorage.setItem("groq_key", key);
    checkGoogleOAuth();
    goToStep(2);
  }
}

function prevStep(from) {
  goToStep(from - 1);
}

async function checkGoogleOAuth() {
  try {
    const res = await fetch("/auth/status");
    const data = await res.json();
    if (!data.configured) {
      document.getElementById("step2-login-section").classList.add("hidden");
      document.getElementById("step2-google-error").classList.remove("hidden");
    }
  } catch { /* Google OAuth 상태 확인 불가 시 그냥 표시 */ }
}

function finishSetup() {
  document.getElementById("setup-wizard").classList.add("hidden");
  showMainApp();
}

function showMainApp() {
  document.getElementById("main-app").classList.remove("hidden");
  updateGoogleUI();
}

function shakeInput(id) {
  const el = document.getElementById(id);
  el.style.animation = "none";
  el.offsetHeight;
  el.style.animation = "shake 0.3s ease";
  el.focus();
  el.placeholder = "키를 입력해 주세요!";
}

// ── Google login state ─────────────────────────────────────────
async function loadUser() {
  try {
    const res = await fetch("/auth/me");
    user = (await res.json());
    if (!user.logged_in) user = null;
  } catch { user = null; }
}

function updateGoogleUI() {
  const chip = document.getElementById("user-chip");
  const banner = document.getElementById("google-connect-banner");
  const drawerLogin = document.getElementById("drawer-google-login");
  const drawerLoggedIn = document.getElementById("drawer-google-loggedin");

  if (user) {
    chip.classList.remove("hidden");
    document.getElementById("user-avatar").src = user.picture || "";
    document.getElementById("user-name").textContent = user.name || user.email;
    document.getElementById("drawer-email").textContent = user.email;
    banner.classList.add("hidden");
    drawerLogin.classList.add("hidden");
    drawerLoggedIn.classList.remove("hidden");
  } else {
    chip.classList.add("hidden");
    banner.classList.remove("hidden");
    drawerLogin.classList.remove("hidden");
    drawerLoggedIn.classList.add("hidden");
  }
}

function customTemplatesStorageKey() {
  return user?.email ? `${CUSTOM_TEMPLATES_KEY}:${user.email}` : CUSTOM_TEMPLATES_KEY;
}

function normalizeTemplate(template) {
  if (!template || typeof template !== "object") return null;
  const id = typeof template.id === "string" ? template.id : "";
  const name = typeof template.name === "string" ? template.name.trim() : "";
  const description = typeof template.description === "string" ? template.description.trim() : "";
  const prompt = typeof template.prompt === "string" ? template.prompt.trim() : "";
  if (!id || !name || !prompt) return null;
  return {
    id,
    name,
    description,
    prompt,
    is_preset: false,
    forked_from: typeof template.forked_from === "string" ? template.forked_from : undefined,
  };
}

function loadCustomTemplates() {
  try {
    const raw = JSON.parse(localStorage.getItem(customTemplatesStorageKey()) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeTemplate).filter(Boolean);
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates) {
  const sanitized = templates.map(normalizeTemplate).filter(Boolean).map(template => ({
    id: template.id,
    name: template.name,
    description: template.description,
    prompt: template.prompt,
    forked_from: template.forked_from,
  }));
  localStorage.setItem(customTemplatesStorageKey(), JSON.stringify(sanitized));
}

function generateTemplateId() {
  if (window.crypto?.randomUUID) {
    return `local_${window.crypto.randomUUID()}`;
  }
  return `local_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function confirmLogout() {
  if (confirm(`${user?.email || "Google 계정"}에서 로그아웃할까요?`)) {
    window.location.href = "/auth/logout";
  }
}

// ── Settings drawer ────────────────────────────────────────────
function openSettings() {
  document.getElementById("settings-drawer").classList.remove("hidden");
  document.getElementById("drawer-backdrop").classList.remove("hidden");
}

function closeSettings() {
  document.getElementById("settings-drawer").classList.add("hidden");
  document.getElementById("drawer-backdrop").classList.add("hidden");
}

function toggleVisible(id) {
  const el = document.getElementById(id);
  el.type = el.type === "password" ? "text" : "password";
}

// ── Recording state machine ───────────────────────────────────
function setMainState(state) {
  document.querySelector(".main").dataset.state = state;
}

async function startRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showError("마이크 접근이 거부되었습니다.\n설정 → Safari → 마이크를 허용해 주세요.");
    return;
  }

  const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
  mediaRecorder = new MediaRecorder(stream, { mimeType });
  audioChunks = [];
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    await sendForTranscription(new Blob(audioChunks, { type: mimeType }), mimeType.includes("mp4") ? "mp4" : "webm");
  };
  mediaRecorder.start(1000);
  setMainState("recording");
  startTimer();
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  stopTimer();
  mediaRecorder.stop();
  setMainState("processing_stt");
  document.getElementById("processing-label").textContent = "음성 인식 중...";
}

function startTimer() {
  timerSeconds = 0; updateTimer();
  timerInterval = setInterval(() => { timerSeconds++; updateTimer(); }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }
function updateTimer() {
  const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
  const s = String(timerSeconds % 60).padStart(2, "0");
  document.getElementById("timer").textContent = `${m}:${s}`;
}

// ── API calls ─────────────────────────────────────────────────
async function sendForTranscription(blob, ext) {
  const formData = new FormData();
  formData.append("audio", blob, `recording.${ext}`);
  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "X-Groq-Key": localStorage.getItem("groq_key") || "" },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "음성 인식에 실패했습니다.");
    document.getElementById("transcript-text").value = data.transcript;
    setMainState("transcript_ready");
  } catch (e) { showError(e.message); }
}

async function generateMinutes() {
  const transcript = document.getElementById("transcript-text").value.trim();
  if (!transcript) { showError("녹취 내용이 없습니다."); return; }

  const template_id = document.getElementById("template-select")?.value || "general";
  const output_language = document.getElementById("language-select")?.value || "ko";
  const selectedTemplate = allTemplates.find(t => t.id === template_id);
  const template_prompt = selectedTemplate && !selectedTemplate.is_preset ? selectedTemplate.prompt : undefined;

  setMainState("processing_minutes");
  document.getElementById("processing-label").textContent = "회의록 생성 중...";

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Groq-Key": localStorage.getItem("groq_key") || "",
      },
      body: JSON.stringify({ transcript, save: false, template_id, output_language, template_prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "회의록 생성에 실패했습니다.");

    currentMinutes = data.minutes;
    currentFilename = data.filename || "meeting.md";
    renderMinutes(currentMinutes);
    renderResultBadges(data);

    setMainState("results");
  } catch (e) { showError(e.message); }
}

async function copyMinutes() {
  try { await navigator.clipboard.writeText(currentMinutes); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = currentMinutes;
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
  }
  alert("복사되었습니다.");
}

function downloadMinutes() {
  const blob = new Blob([currentMinutes], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = currentFilename; a.click();
  URL.revokeObjectURL(url);
}

function showError(msg) {
  document.getElementById("error-message").textContent = msg;
  setMainState("error");
}

function renderMinutes(markdown) {
  const target = document.getElementById("minutes-body");
  if (!window.marked?.parse) {
    target.textContent = markdown;
    return;
  }

  const rendered = window.marked.parse(markdown);
  if (window.DOMPurify) {
    target.innerHTML = window.DOMPurify.sanitize(rendered);
    return;
  }
  target.textContent = markdown;
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function renderResultBadges(data) {
  const badges = document.getElementById("result-badges");
  badges.replaceChildren();

  if (data.drive_link && isSafeExternalUrl(data.drive_link)) {
    const driveLink = document.createElement("a");
    driveLink.href = data.drive_link;
    driveLink.target = "_blank";
    driveLink.rel = "noopener noreferrer";
    driveLink.className = "rbadge rbadge-drive";
    driveLink.textContent = "📁 Drive 저장됨";
    badges.appendChild(driveLink);
  }

  if (data.email_sent) {
    const emailBadge = document.createElement("span");
    emailBadge.className = "rbadge rbadge-email";
    emailBadge.textContent = "✉️ 이메일 전송됨";
    badges.appendChild(emailBadge);
  }

  if (data.drive_error) {
    const warningBadge = document.createElement("span");
    warningBadge.className = "rbadge rbadge-warn";
    warningBadge.textContent = "⚠️ Drive 저장 실패";
    badges.appendChild(warningBadge);
  }
}

function resetAll() {
  stopTimer();
  if (stream) stream.getTracks().forEach(t => t.stop());
  mediaRecorder = null; audioChunks = []; stream = null;
  timerSeconds = 0; currentMinutes = ""; currentFilename = "";
  document.getElementById("transcript-text").value = "";
  document.getElementById("minutes-body").replaceChildren();
  document.getElementById("result-badges").replaceChildren();
  setMainState("idle");
}

// ── Templates & Languages ─────────────────────────────────────
async function loadTemplates() {
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    allTemplates = [...(data.templates || []), ...loadCustomTemplates()];
    allLanguages = data.languages || [];
    renderTemplateSelect();
    renderLanguageSelect();
  } catch (e) { console.error("템플릿 로드 실패", e); }
}

function renderTemplateSelect() {
  const sel = document.getElementById("template-select");
  if (!sel) return;
  const saved = localStorage.getItem("template_id") || "general";
  const selectedId = allTemplates.some(t => t.id === saved) ? saved : "general";
  const fragment = document.createDocumentFragment();

  allTemplates.forEach(template => {
    const option = document.createElement("option");
    option.value = template.id;
    option.selected = template.id === selectedId;
    option.textContent = `${template.name}${template.is_preset ? "" : " ★"}`;
    fragment.appendChild(option);
  });

  sel.replaceChildren(fragment);
  sel.onchange = () => localStorage.setItem("template_id", sel.value);
  localStorage.setItem("template_id", selectedId);
}

function renderLanguageSelect() {
  const sel = document.getElementById("language-select");
  if (!sel) return;
  const saved = localStorage.getItem("output_language") || "ko";
  const fragment = document.createDocumentFragment();
  const selectedCode = allLanguages.some(language => language.code === saved) ? saved : "ko";

  allLanguages.forEach(language => {
    const option = document.createElement("option");
    option.value = language.code;
    option.selected = language.code === selectedCode;
    option.textContent = language.name;
    fragment.appendChild(option);
  });

  sel.replaceChildren(fragment);
  sel.onchange = () => localStorage.setItem("output_language", sel.value);
  localStorage.setItem("output_language", selectedCode);
}

function openTemplateManager() {
  closeSettings();
  openTemplateEditor(null);
}

function openTemplateEditor(templateId) {
  const id = templateId !== undefined ? templateId : document.getElementById("template-select")?.value;
  const tpl = allTemplates.find(t => t.id === id) || null;
  editingTemplateId = tpl ? tpl.id : null;

  document.getElementById("modal-title").textContent = tpl ? "템플릿 편집" : "새 템플릿";
  document.getElementById("tpl-name").value = tpl?.name || "";
  document.getElementById("tpl-desc").value = tpl?.description || "";
  document.getElementById("tpl-prompt").value = tpl?.prompt || "";

  const deleteWrap = document.getElementById("tpl-delete-wrap");
  const forkNote = document.getElementById("tpl-fork-note");
  if (tpl?.is_preset) {
    deleteWrap.classList.add("hidden");
    forkNote.classList.remove("hidden");
  } else {
    deleteWrap.classList.toggle("hidden", !tpl);
    forkNote.classList.add("hidden");
  }

  document.getElementById("template-modal").classList.remove("hidden");
}

function closeTemplateModal(event) {
  if (event && event.target !== document.getElementById("template-modal")) return;
  document.getElementById("template-modal").classList.add("hidden");
  editingTemplateId = null;
}

async function saveTemplate() {
  const name = document.getElementById("tpl-name").value.trim();
  const desc = document.getElementById("tpl-desc").value.trim();
  const prompt = document.getElementById("tpl-prompt").value.trim();
  if (!name || !prompt) { alert("이름과 프롬프트를 입력해 주세요."); return; }

  const existing = allTemplates.find(t => t.id === editingTemplateId);
  const customTemplates = loadCustomTemplates();
  let template;

  if (editingTemplateId && existing && !existing.is_preset) {
    template = { ...existing, name, description: desc, prompt, is_preset: false };
    const updated = customTemplates.map(item => item.id === template.id ? template : item);
    saveCustomTemplates(updated);
  } else {
    template = {
      id: generateTemplateId(),
      name,
      description: desc,
      prompt,
      is_preset: false,
      ...(existing?.is_preset ? { forked_from: existing.id } : {}),
    };
    saveCustomTemplates([...customTemplates, template]);
  }

  localStorage.setItem("template_id", template.id);
  document.getElementById("template-modal").classList.add("hidden");
  await loadTemplates();
}

async function deleteTemplate() {
  if (!editingTemplateId) return;
  if (!confirm("이 템플릿을 삭제할까요?")) return;
  const customTemplates = loadCustomTemplates().filter(template => template.id !== editingTemplateId);
  saveCustomTemplates(customTemplates);
  if (localStorage.getItem("template_id") === editingTemplateId) {
    localStorage.setItem("template_id", "general");
  }
  document.getElementById("template-modal").classList.add("hidden");
  await loadTemplates();
}
