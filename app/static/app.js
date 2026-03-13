let mediaRecorder = null, audioChunks = [], stream = null;
let timerInterval = null, timerSeconds = 0;
let currentMinutes = "", currentFilename = "";
let user = null;
let currentWizardStep = 1;
let allTemplates = [], allLanguages = [];
let editingTemplateId = null;

// ── Init ─────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([loadUser(), loadTemplates()]);

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

  setMainState("processing_minutes");
  document.getElementById("processing-label").textContent = "회의록 생성 중...";

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Groq-Key": localStorage.getItem("groq_key") || "",
      },
      body: JSON.stringify({ transcript, save: true, template_id, output_language }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "회의록 생성에 실패했습니다.");

    currentMinutes = data.minutes;
    currentFilename = data.filename || "meeting.md";
    document.getElementById("minutes-body").innerHTML = marked.parse(currentMinutes);

    const badges = document.getElementById("result-badges");
    badges.innerHTML = "";
    if (data.drive_link) badges.innerHTML += `<a href="${data.drive_link}" target="_blank" class="rbadge rbadge-drive">📁 Drive 저장됨</a>`;
    if (data.email_sent) badges.innerHTML += `<span class="rbadge rbadge-email">✉️ 이메일 전송됨</span>`;
    if (data.drive_error) badges.innerHTML += `<span class="rbadge rbadge-warn">⚠️ Drive 저장 실패</span>`;

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

function resetAll() {
  stopTimer();
  if (stream) stream.getTracks().forEach(t => t.stop());
  mediaRecorder = null; audioChunks = []; stream = null;
  timerSeconds = 0; currentMinutes = ""; currentFilename = "";
  document.getElementById("transcript-text").value = "";
  document.getElementById("minutes-body").innerHTML = "";
  document.getElementById("result-badges").innerHTML = "";
  setMainState("idle");
}

// ── Templates & Languages ─────────────────────────────────────
async function loadTemplates() {
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    allTemplates = data.templates || [];
    allLanguages = data.languages || [];
    renderTemplateSelect();
    renderLanguageSelect();
  } catch (e) { console.error("템플릿 로드 실패", e); }
}

function renderTemplateSelect() {
  const sel = document.getElementById("template-select");
  if (!sel) return;
  const saved = localStorage.getItem("template_id") || "general";
  sel.innerHTML = allTemplates.map(t =>
    `<option value="${t.id}" ${t.id === saved ? "selected" : ""}>${t.name}${t.is_preset ? "" : " ★"}</option>`
  ).join("");
  sel.addEventListener("change", () => localStorage.setItem("template_id", sel.value));
}

function renderLanguageSelect() {
  const sel = document.getElementById("language-select");
  if (!sel) return;
  const saved = localStorage.getItem("output_language") || "ko";
  sel.innerHTML = allLanguages.map(l =>
    `<option value="${l.code}" ${l.code === saved ? "selected" : ""}>${l.name}</option>`
  ).join("");
  sel.addEventListener("change", () => localStorage.setItem("output_language", sel.value));
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
  let res;
  if (editingTemplateId && !existing?.is_preset) {
    res = await fetch(`/api/templates/${editingTemplateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: desc, prompt }),
    });
  } else {
    const body = editingTemplateId
      ? { name, description: desc, prompt }  // fork preset
      : { name, description: desc, prompt };
    const url = editingTemplateId ? `/api/templates/${editingTemplateId}` : "/api/templates";
    const method = editingTemplateId ? "PUT" : "POST";
    res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  if (res.ok) {
    document.getElementById("template-modal").classList.add("hidden");
    await loadTemplates();
  } else {
    alert("저장 실패");
  }
}

async function deleteTemplate() {
  if (!editingTemplateId) return;
  if (!confirm("이 템플릿을 삭제할까요?")) return;
  const res = await fetch(`/api/templates/${editingTemplateId}`, { method: "DELETE" });
  if (res.ok) {
    document.getElementById("template-modal").classList.add("hidden");
    await loadTemplates();
  } else {
    alert("삭제 실패");
  }
}
