// ==========================================
// 1. STATE & LOCALSTORAGE HELPERS
// ==========================================
const STORAGE_KEYS = {
  QUESTIONS: 'examprep_questions_v1',
  MISTAKES: 'examprep_mistakes_v1',
  BOOKMARKS: 'examprep_bookmarks_v1',
  THEME: 'examprep_theme_v1'
};

let state = {
  activeTab: 'practice',
  questions: [],
  mistakes: [],   // array of question IDs
  bookmarks: [],  // array of question IDs

  // Practice Mode State
  practice: {
    exam: 'ALL',
    post: 'ALL',
    subject: 'ALL',
    topic: 'ALL',
    source: 'ALL', // ALL | PYQ | PRACTICE
    list: [],
    currentIndex: 0,
    answers: {},   // { qId: selectedIndex }
    expTabs: {}    // { qId: 'shortcut' | 'detailed' }
  },

  // Mock Test State
  mock: {
    phase: 'setup', // setup | active | result
    exam: 'SSC CGL',
    post: 'Tier-1',
    source: 'ALL',
    limit: 'ALL',
    questions: [],
    currentIndex: 0,
    answers: {},        // { idx: optionIndex }
    visited: new Set(), // Set of indices
    marked: new Set(),  // Set of indices
    timeLeft: 0,
    totalSeconds: 0,
    timerId: null,
    expTabs: {},        // { qId: 'shortcut' | 'detailed' }
    paletteOpen: false
  },

  // Revision State
  revision: {
    subTab: 'mistakes', // mistakes | bookmarks
    answers: {},        // { qId: optionIndex }
    expTabs: {}         // { qId: 'shortcut' | 'detailed' }
  },

  // Manage Questions State
  manage: {
    search: '',
    showDualInputs: false
  }
};

function loadData() {
  try {
    const savedQ = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
    state.questions = savedQ ? JSON.parse(savedQ) : [...STARTER_QUESTIONS];
    if (!savedQ) saveQuestions();

    state.mistakes = JSON.parse(localStorage.getItem(STORAGE_KEYS.MISTAKES) || '[]');
    state.bookmarks = JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOKMARKS) || '[]');

    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
    applyTheme(savedTheme);
  } catch (e) {
    state.questions = [...STARTER_QUESTIONS];
  }
}

function saveQuestions() {
  localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(state.questions));
}
function saveMistakes() {
  localStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(state.mistakes));
  updateMistakeBadge();
}
function saveBookmarks() {
  localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(state.bookmarks));
}

function addMistake(qId) {
  if (!state.mistakes.includes(qId)) {
    state.mistakes.unshift(qId);
    saveMistakes();
  }
}

function removeMistake(qId) {
  state.mistakes = state.mistakes.filter(id => id !== qId);
  saveMistakes();
  showToast('Removed from Mistake Notebook');
  render();
}

function toggleBookmark(qId) {
  if (state.bookmarks.includes(qId)) {
    state.bookmarks = state.bookmarks.filter(id => id !== qId);
    showToast('Bookmark removed');
  } else {
    state.bookmarks.unshift(qId);
    showToast('Question bookmarked');
  }
  saveBookmarks();
  render();
}

// ==========================================
// 2. UTILITIES (THEME, TOAST, KATEX MATH)
// ==========================================
function applyTheme(theme) {
  const html = document.documentElement;
  const icon = document.getElementById('theme-icon');
  if (theme === 'dark') {
    html.classList.add('dark');
    if (icon) icon.textContent = '☀️';
  } else {
    html.classList.remove('dark');
    if (icon) icon.textContent = '🌙';
  }
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function updateMistakeBadge() {
  const badge = document.getElementById('mistake-badge');
  if (!badge) return;
  const validCount = state.mistakes.filter(id => state.questions.some(q => q.id === id)).length;
  if (validCount > 0) {
    badge.textContent = validCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeLatex(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function renderMathText(raw) {
  if (!raw) return '';
  let text = escapeHtml(raw);

  // Block math $$ ... $$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    try {
      return katex.renderToString(unescapeLatex(expr.trim()), { displayMode: true, throwOnError: false });
    } catch {
      return expr;
    }
  });

  // Inline math $ ... $
  text = text.replace(/\$([^$\n]+?)\$/g, (_, expr) => {
    try {
      return katex.renderToString(unescapeLatex(expr.trim()), { displayMode: false, throwOnError: false });
    } catch {
      return expr;
    }
  });

  // Bold **text** and line breaks
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

function hasDualMethod(q) {
  return Boolean((q.shortcutExplanation && q.shortcutExplanation.trim()) || (q.detailedExplanation && q.detailedExplanation.trim()));
}

function getPostConfig(exam, post) {
  if (EXAM_CONFIG[exam] && EXAM_CONFIG[exam][post]) {
    return EXAM_CONFIG[exam][post];
  }
  return { marksPerQ: 1, negativeMark: 0.25, durationMins: 60 };
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function uniqueValues(list, key) {
  return [...new Set(list.map(item => item[key]).filter(Boolean))];
}

// ==========================================
// 3. SHARED EXPLANATION CARD COMPONENT
// ==========================================
function renderExplanationCard(q, activeTabMap, onTabFnName) {
  const isDual = hasDualMethod(q);
  const currentTab = activeTabMap[q.id] || 'shortcut';

  if (isDual) {
    const shortcutHtml = q.shortcutExplanation
      ? renderMathText(q.shortcutExplanation)
      : '<span class="text-slate-400">No shortcut provided.</span>';
    const detailedHtml = q.detailedExplanation
      ? renderMathText(q.detailedExplanation)
      : renderMathText(q.explanation || 'No detailed explanation provided.');

    return `
      <div class="mt-4 rounded-xl border border-brand-200 dark:border-brand-700/60 bg-brand-50/50 dark:bg-slate-800/70 overflow-hidden animate-fade">
        <div class="flex border-b border-brand-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60">
          <button onclick="${onTabFnName}('${q.id}', 'shortcut')"
            class="flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
              currentTab === 'shortcut'
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }">
            ⚡ Exam Shortcut / Trick
          </button>
          <button onclick="${onTabFnName}('${q.id}', 'detailed')"
            class="flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
              currentTab === 'detailed'
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }">
            📖 Full Detailed Method
          </button>
        </div>
        <div class="p-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
          ${currentTab === 'shortcut' ? shortcutHtml : detailedHtml}
        </div>
      </div>
    `;
  }

  return `
    <div class="mt-4 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 animate-fade">
      <div class="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1.5">
        Explanation
      </div>
      <div class="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
        ${renderMathText(q.explanation || 'Correct answer: ' + q.options[q.correctIndex])}
      </div>
    </div>
  `;
}

// ==========================================
// 4. NAVIGATION
// ==========================================
function switchTab(tab) {
  if (state.mock.phase === 'active' && tab !== 'mock') {
    if (!confirm('A mock test is currently running. Leave and pause?')) return;
    stopMockTimer();
  }
  state.activeTab = tab;
  if (tab === 'practice') refreshPracticeList();
  render();
}

function updateNavStyles() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.tab === state.activeTab;
    btn.className = `nav-btn px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
      isActive
        ? 'bg-brand-600 text-white shadow-sm'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;
  });
}

// ==========================================
// 5. PRACTICE MODE
// ==========================================
function refreshPracticeList() {
  const p = state.practice;
  p.list = state.questions.filter(q => {
    if (p.exam !== 'ALL' && q.exam !== p.exam) return false;
    if (p.post !== 'ALL' && q.post !== p.post) return false;
    if (p.subject !== 'ALL' && q.subject !== p.subject) return false;
    if (p.topic !== 'ALL' && q.topic !== p.topic) return false;
    if (p.source === 'PYQ' && !q.isPyq) return false;
    if (p.source === 'PRACTICE' && q.isPyq) return false;
    return true;
  });
  if (p.currentIndex >= p.list.length) p.currentIndex = 0;
}

function updatePracticeFilter(field, value) {
  const p = state.practice;
  p[field] = value;
  if (field === 'exam') { p.post = 'ALL'; p.subject = 'ALL'; p.topic = 'ALL'; }
  if (field === 'post') { p.subject = 'ALL'; p.topic = 'ALL'; }
  if (field === 'subject') { p.topic = 'ALL'; }
  p.currentIndex = 0;
  refreshPracticeList();
  render();
}

function selectPracticeOption(qId, optIdx) {
  if (state.practice.answers[qId] !== undefined) return;
  state.practice.answers[qId] = optIdx;
  const q = state.questions.find(item => item.id === qId);
  if (q && optIdx !== q.correctIndex) {
    addMistake(qId);
  }
  render();
}

function setPracticeExpTab(qId, tab) {
  state.practice.expTabs[qId] = tab;
  render();
}

function resetPracticeSession() {
  state.practice.answers = {};
  state.practice.currentIndex = 0;
  showToast('Practice session reset');
  render();
}

function renderPracticeMode() {
  const p = state.practice;
  const exams = uniqueValues(state.questions, 'exam');
  const postPool = p.exam === 'ALL' ? state.questions : state.questions.filter(q => q.exam === p.exam);
  const posts = uniqueValues(postPool, 'post');
  const subjPool = p.post === 'ALL' ? postPool : postPool.filter(q => q.post === p.post);
  const subjects = uniqueValues(subjPool, 'subject');
  const topicPool = p.subject === 'ALL' ? subjPool : subjPool.filter(q => q.subject === p.subject);
  const topics = uniqueValues(topicPool, 'topic');

  // Session accuracy stats
  const attemptedIds = Object.keys(p.answers);
  const correctCount = attemptedIds.filter(id => {
    const q = state.questions.find(item => item.id === id);
    return q && p.answers[id] === q.correctIndex;
  }).length;
  const accuracy = attemptedIds.length ? Math.round((correctCount / attemptedIds.length) * 100) : 0;

  const q = p.list[p.currentIndex];
  const selected = q ? p.answers[q.id] : undefined;
  const isBookmarked = q && state.bookmarks.includes(q.id);

  return `
    <!-- Filter Bar -->
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 mb-5 shadow-sm">
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Exam</label>
          <select onchange="updatePracticeFilter('exam', this.value)" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-sm">
            <option value="ALL">All Exams</option>
            ${exams.map(e => `<option value="${escapeHtml(e)}" ${p.exam === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Post / Tier</label>
          <select onchange="updatePracticeFilter('post', this.value)" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-sm">
            <option value="ALL">All Posts</option>
            ${posts.map(pt => `<option value="${escapeHtml(pt)}" ${p.post === pt ? 'selected' : ''}>${escapeHtml(pt)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Subject</label>
          <select onchange="updatePracticeFilter('subject', this.value)" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-sm">
            <option value="ALL">All Subjects</option>
            ${subjects.map(s => `<option value="${escapeHtml(s)}" ${p.subject === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Topic</label>
          <select onchange="updatePracticeFilter('topic', this.value)" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-sm">
            <option value="ALL">All Topics</option>
            ${topics.map(t => `<option value="${escapeHtml(t)}" ${p.topic === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="col-span-2 sm:col-span-1">
          <label class="block text-xs font-medium text-slate-500 mb-1">Question Type</label>
          <select onchange="updatePracticeFilter('source', this.value)" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-sm">
            <option value="ALL" ${p.source === 'ALL' ? 'selected' : ''}>All Questions</option>
            <option value="PYQ" ${p.source === 'PYQ' ? 'selected' : ''}>PYQs Only</option>
            <option value="PRACTICE" ${p.source === 'PRACTICE' ? 'selected' : ''}>Practice MCQs</option>
          </select>
        </div>
      </div>

      <!-- Session Stats Bar -->
      <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
        <div class="flex items-center gap-4">
          <span class="text-slate-500 dark:text-slate-400">Matching: <strong class="text-slate-900 dark:text-white">${p.list.length}</strong></span>
          <span class="text-slate-500 dark:text-slate-400">Attempted: <strong class="text-slate-900 dark:text-white">${attemptedIds.length}</strong></span>
          <span class="text-slate-500 dark:text-slate-400">Accuracy: <strong class="text-emerald-600 dark:text-emerald-400">${accuracy}%</strong></span>
        </div>
        ${attemptedIds.length > 0 ? `<button onclick="resetPracticeSession()" class="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">Reset Session</button>` : ''}
      </div>
    </div>

    ${!q ? `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
        <p class="text-slate-500 dark:text-slate-400 mb-3">No questions match the selected filters.</p>
        <button onclick="updatePracticeFilter('exam', 'ALL')" class="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium">Show All Questions</button>
      </div>
    ` : `
      <!-- Question Card -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">Q ${p.currentIndex + 1} / ${p.list.length}</span>
            <span class="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-medium">${escapeHtml(q.exam)} · ${escapeHtml(q.post)}</span>
            <span class="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${escapeHtml(q.subject)} — ${escapeHtml(q.topic)}</span>
            ${q.isPyq
              ? `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">PYQ${q.pyqYear ? ': ' + escapeHtml(q.pyqYear) : ''}</span>`
              : `<span class="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 font-medium">Syllabus MCQ</span>`
            }
          </div>
          <button onclick="toggleBookmark('${q.id}')" class="px-3 py-1 rounded-lg border text-xs font-medium transition ${
            isBookmarked
              ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }">
            ${isBookmarked ? '★ Bookmarked' : '☆ Bookmark'}
          </button>
        </div>

        <div class="text-base sm:text-lg font-medium leading-relaxed mb-5">
          ${renderMathText(q.question)}
        </div>

        <!-- Options -->
        <div class="space-y-2.5">
          ${q.options.map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            let cls = 'border-slate-200 dark:border-slate-700 hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-slate-800';
            let badgeCls = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';

            if (selected !== undefined) {
              if (idx === q.correctIndex) {
                cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100';
                badgeCls = 'bg-emerald-600 text-white';
              } else if (idx === selected && selected !== q.correctIndex) {
                cls = 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100';
                badgeCls = 'bg-rose-600 text-white';
              } else {
                cls = 'border-slate-200 dark:border-slate-800 opacity-60';
              }
            }

            return `
              <button onclick="selectPracticeOption('${q.id}', ${idx})" ${selected !== undefined ? 'disabled' : ''}
                class="w-full text-left p-3.5 rounded-xl border-2 flex items-start gap-3 transition ${cls}">
                <span class="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold ${badgeCls}">${letter}</span>
                <span class="text-sm sm:text-base pt-0.5">${renderMathText(opt)}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Instant Explanation -->
        ${selected !== undefined ? renderExplanationCard(q, p.expTabs, 'setPracticeExpTab') : ''}

        <!-- Prev / Next Footer -->
        <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button onclick="navigatePractice(-1)" ${p.currentIndex === 0 ? 'disabled' : ''}
            class="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800">
            ← Previous
          </button>
          <button onclick="navigatePractice(1)" ${p.currentIndex >= p.list.length - 1 ? 'disabled' : ''}
            class="px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-brand-700">
            Next →
          </button>
        </div>
      </div>
    `}
  `;
}

function navigatePractice(delta) {
  const next = state.practice.currentIndex + delta;
  if (next >= 0 && next < state.practice.list.length) {
    state.practice.currentIndex = next;
    render();
  }
}

// ==========================================
// 6. MOCK TEST MODE (TIMER + PALETTE + NEGATIVE MARKING)
// ==========================================
function updateMockSetup(field, value) {
  state.mock[field] = value;
  if (field === 'exam') {
    const posts = uniqueValues(state.questions.filter(q => q.exam === value), 'post');
    state.mock.post = posts[0] || 'ALL';
  }
  render();
}

function startMockTest() {
  const m = state.mock;
  let pool = state.questions.filter(q => {
    if (m.exam !== 'ALL' && q.exam !== m.exam) return false;
    if (m.post !== 'ALL' && q.post !== m.post) return false;
    if (m.source === 'PYQ' && !q.isPyq) return false;
    if (m.source === 'PRACTICE' && q.isPyq) return false;
    return true;
  });

  if (pool.length === 0) {
    showToast('No questions available for this mock configuration');
    return;
  }

  // Shuffle questions
  pool = [...pool].sort(() => Math.random() - 0.5);
  if (m.limit !== 'ALL') {
    pool = pool.slice(0, Number(m.limit));
  }

  const cfg = getPostConfig(m.exam, m.post);
  // Scale time proportionally if fewer than 50 questions, or use full duration for Full Mock
  const mins = m.limit === 'ALL' && pool.length >= 40 ? cfg.durationMins : Math.max(5, Math.ceil(pool.length * 1.2));

  m.questions = pool;
  m.currentIndex = 0;
  m.answers = {};
  m.visited = new Set([0]);
  m.marked = new Set();
  m.totalSeconds = mins * 60;
  m.timeLeft = m.totalSeconds;
  m.phase = 'active';
  m.expTabs = {};
  m.paletteOpen = false;

  startMockTimer();
  render();
}

function startMockTimer() {
  stopMockTimer();
  state.mock.timerId = setInterval(() => {
    state.mock.timeLeft--;
    const timerEl = document.getElementById('mock-timer');
    if (timerEl) timerEl.textContent = formatTime(state.mock.timeLeft);
    if (state.mock.timeLeft <= 0) {
      submitMockTest(true);
    }
  }, 1000);
}

function stopMockTimer() {
  if (state.mock.timerId) {
    clearInterval(state.mock.timerId);
    state.mock.timerId = null;
  }
}

function selectMockOption(optIdx) {
  state.mock.answers[state.mock.currentIndex] = optIdx;
  render();
}

function clearMockResponse() {
  delete state.mock.answers[state.mock.currentIndex];
  render();
}

function goToMockQuestion(idx) {
  if (idx < 0 || idx >= state.mock.questions.length) return;
  state.mock.currentIndex = idx;
  state.mock.visited.add(idx);
  state.mock.paletteOpen = false;
  render();
}

function mockMarkAndNext() {
  const idx = state.mock.currentIndex;
  if (state.mock.marked.has(idx)) {
    state.mock.marked.delete(idx);
  } else {
    state.mock.marked.add(idx);
  }
  if (idx < state.mock.questions.length - 1) {
    goToMockQuestion(idx + 1);
  } else {
    render();
  }
}

function mockSaveAndNext() {
  const idx = state.mock.currentIndex;
  state.mock.marked.delete(idx);
  if (idx < state.mock.questions.length - 1) {
    goToMockQuestion(idx + 1);
  } else {
    render();
  }
}

function submitMockTest(auto = false) {
  if (!auto && !confirm('Submit your mock test and view results?')) return;
  stopMockTimer();

  // Save incorrect answers to Mistake Notebook
  state.mock.questions.forEach((q, idx) => {
    const ans = state.mock.answers[idx];
    if (ans !== undefined && ans !== q.correctIndex) {
      addMistake(q.id);
    }
  });

  state.mock.phase = 'result';
  render();
}

function setMockExpTab(qId, tab) {
  state.mock.expTabs[qId] = tab;
  render();
}

function toggleMobilePalette() {
  state.mock.paletteOpen = !state.mock.paletteOpen;
  render();
}

function renderMockMode() {
  const m = state.mock;

  // --- SETUP SCREEN ---
  if (m.phase === 'setup') {
    const exams = uniqueValues(state.questions, 'exam');
    const posts = uniqueValues(state.questions.filter(q => m.exam === 'ALL' || q.exam === m.exam), 'post');
    const cfg = getPostConfig(m.exam, m.post);

    const availableCount = state.questions.filter(q => {
      if (m.exam !== 'ALL' && q.exam !== m.exam) return false;
      if (m.post !== 'ALL' && q.post !== m.post) return false;
      if (m.source === 'PYQ' && !q.isPyq) return false;
      if (m.source === 'PRACTICE' && q.isPyq) return false;
      return true;
    }).length;

    return `
      <div class="max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <h2 class="text-xl font-bold mb-1">Mock Test Simulator</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-5">Real timer, TCS iON-style question palette, and official negative marking. Explanations unlock after submission.</p>

        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">Exam</label>
              <select onchange="updateMockSetup('exam', this.value)" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm">
                <option value="ALL" ${m.exam === 'ALL' ? 'selected' : ''}>All Exams Mixed</option>
                ${exams.map(e => `<option value="${escapeHtml(e)}" ${m.exam === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">Post / Tier</label>
              <select onchange="updateMockSetup('post', this.value)" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm">
                <option value="ALL" ${m.post === 'ALL' ? 'selected' : ''}>All Posts</option>
                ${posts.map(pt => `<option value="${escapeHtml(pt)}" ${m.post === pt ? 'selected' : ''}>${escapeHtml(pt)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">Question Source</label>
              <select onchange="updateMockSetup('source', this.value)" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm">
                <option value="ALL" ${m.source === 'ALL' ? 'selected' : ''}>All Questions</option>
                <option value="PYQ" ${m.source === 'PYQ' ? 'selected' : ''}>PYQs Only</option>
                <option value="PRACTICE" ${m.source === 'PRACTICE' ? 'selected' : ''}>Practice MCQs Only</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">Test Length</label>
              <select onchange="updateMockSetup('limit', this.value)" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm">
                <option value="ALL" ${m.limit === 'ALL' ? 'selected' : ''}>All Available (${availableCount})</option>
                <option value="5" ${m.limit === '5' ? 'selected' : ''}>Quick 5 Questions</option>
                <option value="10" ${m.limit === '10' ? 'selected' : ''}>Mini 10 Questions</option>
                <option value="25" ${m.limit === '25' ? 'selected' : ''}>25 Questions</option>
              </select>
            </div>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-sm space-y-1">
            <div class="flex justify-between"><span class="text-slate-500">Available Questions:</span><strong>${availableCount}</strong></div>
            <div class="flex justify-between"><span class="text-slate-500">Marking Scheme:</span><strong class="text-emerald-600">+${cfg.marksPerQ}</strong> / <strong class="text-rose-500">-${cfg.negativeMark}</strong></div>
          </div>

          <button onclick="startMockTest()" ${availableCount === 0 ? 'disabled' : ''}
            class="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold text-sm transition">
            Start Mock Test
          </button>
        </div>
      </div>
    `;
  }

  // --- ACTIVE TEST SCREEN ---
  if (m.phase === 'active') {
    const q = m.questions[m.currentIndex];
    const selected = m.answers[m.currentIndex];

    const paletteButtons = m.questions.map((_, i) => {
      const isAnswered = m.answers[i] !== undefined;
      const isMarked = m.marked.has(i);
      const isVisited = m.visited.has(i);
      let bg = 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'; // Not visited
      if (isMarked) bg = 'bg-purple-600 text-white';
      else if (isAnswered) bg = 'bg-emerald-600 text-white';
      else if (isVisited) bg = 'bg-rose-500 text-white';

      const ring = i === m.currentIndex ? 'ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-slate-900' : '';
      return `<button onclick="goToMockQuestion(${i})" class="w-9 h-9 rounded-lg text-xs font-bold transition ${bg} ${ring}">${i + 1}</button>`;
    }).join('');

    return `
      <!-- Top Mock Bar -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div class="text-sm font-semibold">${escapeHtml(m.exam)} · ${escapeHtml(m.post)}</div>
        <div class="flex items-center gap-3">
          <div class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono font-bold text-sm ${m.timeLeft < 60 ? 'text-rose-600' : ''}">
            ⏱ <span id="mock-timer">${formatTime(m.timeLeft)}</span>
          </div>
          <button onclick="toggleMobilePalette()" class="lg:hidden px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold">
            Palette
          </button>
          <button onclick="submitMockTest(false)" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold">
            Submit Test
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Main Question Panel -->
        <div class="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
          <div class="flex flex-wrap items-center gap-2 text-xs mb-4">
            <span class="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-bold">Question ${m.currentIndex + 1} of ${m.questions.length}</span>
            <span class="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">${escapeHtml(q.subject)}</span>
            ${q.isPyq ? `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">${escapeHtml(q.pyqYear || 'PYQ')}</span>` : ''}
          </div>

          <div class="text-base sm:text-lg font-medium leading-relaxed mb-5">${renderMathText(q.question)}</div>

          <div class="space-y-2.5">
            ${q.options.map((opt, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const isChosen = selected === idx;
              return `
                <button onclick="selectMockOption(${idx})"
                  class="w-full text-left p-3.5 rounded-xl border-2 flex items-start gap-3 transition ${
                    isChosen
                      ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand-400'
                  }">
                  <span class="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                    isChosen ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
                  }">${letter}</span>
                  <span class="text-sm sm:text-base pt-0.5">${renderMathText(opt)}</span>
                </button>
              `;
            }).join('')}
          </div>

          <!-- Action Controls -->
          <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div class="flex gap-2">
              <button onclick="clearMockResponse()" class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                Clear Response
              </button>
              <button onclick="mockMarkAndNext()" class="px-3 py-2 rounded-xl bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 text-xs sm:text-sm font-medium">
                Mark for Review &amp; Next
              </button>
            </div>
            <button onclick="mockSaveAndNext()" class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-semibold">
              Save &amp; Next →
            </button>
          </div>
        </div>

        <!-- TCS iON Question Palette -->
        <div class="${m.paletteOpen ? 'block' : 'hidden'} lg:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm h-fit">
          <h3 class="font-bold text-sm mb-3">Question Palette</h3>
          <div class="flex flex-wrap gap-2 mb-4">${paletteButtons}</div>
          <div class="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-emerald-600"></span> Answered</div>
            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-rose-500"></span> Not Answered</div>
            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-purple-600"></span> Marked</div>
            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-slate-300 dark:bg-slate-700"></span> Not Visited</div>
          </div>
        </div>
      </div>
    `;
  }

  // --- RESULT & REVIEW DASHBOARD ---
  const cfg = getPostConfig(m.exam, m.post);
  let correct = 0, wrong = 0, unattempted = 0;
  const subjectStats = {};

  m.questions.forEach((q, idx) => {
    if (!subjectStats[q.subject]) subjectStats[q.subject] = { total: 0, correct: 0, wrong: 0 };
    subjectStats[q.subject].total++;
    const ans = m.answers[idx];
    if (ans === undefined) unattempted++;
    else if (ans === q.correctIndex) { correct++; subjectStats[q.subject].correct++; }
    else { wrong++; subjectStats[q.subject].wrong++; }
  });

  const finalScore = (correct * cfg.marksPerQ) - (wrong * cfg.negativeMark);
  const maxScore = m.questions.length * cfg.marksPerQ;
  const accuracy = (correct + wrong) ? Math.round((correct / (correct + wrong)) * 100) : 0;
  const timeUsed = formatTime(Math.max(0, m.totalSeconds - m.timeLeft));

  return `
    <div class="space-y-6">
      <!-- Score Summary -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 class="text-xl font-bold">Mock Test Result</h2>
            <p class="text-sm text-slate-500">${escapeHtml(m.exam)} · ${escapeHtml(m.post)} (+${cfg.marksPerQ} / -${cfg.negativeMark})</p>
          </div>
          <button onclick="state.mock.phase='setup'; render();" class="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold">
            Take Another Mock
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div class="p-3 rounded-xl bg-brand-50 dark:bg-brand-900/30">
            <div class="text-xs text-slate-500 dark:text-slate-400">Final Score</div>
            <div class="text-xl font-bold text-brand-700 dark:text-brand-300">${finalScore.toFixed(2)} / ${maxScore}</div>
          </div>
          <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
            <div class="text-xs text-slate-500">Correct</div>
            <div class="text-xl font-bold text-emerald-600">${correct}</div>
          </div>
          <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40">
            <div class="text-xs text-slate-500">Wrong</div>
            <div class="text-xl font-bold text-rose-600">${wrong}</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
            <div class="text-xs text-slate-500">Accuracy</div>
            <div class="text-xl font-bold">${accuracy}%</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 col-span-2 sm:col-span-1">
            <div class="text-xs text-slate-500">Time Taken</div>
            <div class="text-xl font-bold">${timeUsed}</div>
          </div>
        </div>

        <!-- Subject Breakdown -->
        <div class="mt-5 overflow-x-auto">
          <table class="w-full text-sm text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500">
                <th class="py-2 pr-3">Subject</th>
                <th class="py-2 px-3">Total</th>
                <th class="py-2 px-3">Correct</th>
                <th class="py-2 px-3">Wrong</th>
                <th class="py-2 pl-3">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(subjectStats).map(([subj, st]) => {
                const att = st.correct + st.wrong;
                const acc = att ? Math.round((st.correct / att) * 100) : 0;
                return `
                  <tr class="border-b border-slate-100 dark:border-slate-800">
                    <td class="py-2 pr-3 font-medium">${escapeHtml(subj)}</td>
                    <td class="py-2 px-3">${st.total}</td>
                    <td class="py-2 px-3 text-emerald-600 font-semibold">${st.correct}</td>
                    <td class="py-2 px-3 text-rose-500 font-semibold">${st.wrong}</td>
                    <td class="py-2 pl-3">${acc}%</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Detailed Question-by-Question Review -->
      <h3 class="text-lg font-bold">Detailed Solution Review</h3>
      <div class="space-y-4">
        ${m.questions.map((q, idx) => {
          const userAns = m.answers[idx];
          const status = userAns === undefined ? 'Unattempted' : (userAns === q.correctIndex ? 'Correct' : 'Wrong');
          const statusCls = status === 'Correct'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
            : status === 'Wrong'
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

          return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                <span class="font-bold">Q${idx + 1} · ${escapeHtml(q.subject)} (${escapeHtml(q.topic)})</span>
                <span class="px-2.5 py-1 rounded-full font-semibold ${statusCls}">${status}</span>
              </div>
              <div class="font-medium mb-3">${renderMathText(q.question)}</div>
              <div class="text-sm space-y-1 mb-2">
                <div>Your Answer: <strong>${userAns !== undefined ? renderMathText(q.options[userAns]) : 'Not Attempted'}</strong></div>
                <div class="text-emerald-700 dark:text-emerald-400">Correct Answer: <strong>${renderMathText(q.options[q.correctIndex])}</strong></div>
              </div>
              ${renderExplanationCard(q, m.expTabs, 'setMockExpTab')}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ==========================================
// 7. REVISION TAB (MISTAKES & BOOKMARKS)
// ==========================================
function setRevisionSubTab(sub) {
  state.revision.subTab = sub;
  render();
}

function selectRevisionOption(qId, optIdx) {
  state.revision.answers[qId] = optIdx;
  render();
}

function setRevisionExpTab(qId, tab) {
  state.revision.expTabs[qId] = tab;
  render();
}

function renderRevisionMode() {
  const r = state.revision;
  const ids = r.subTab === 'mistakes' ? state.mistakes : state.bookmarks;
  const list = ids.map(id => state.questions.find(q => q.id === id)).filter(Boolean);

  return `
    <div class="mb-5 flex items-center gap-2">
      <button onclick="setRevisionSubTab('mistakes')" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${
        r.subTab === 'mistakes' ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
      }">Mistake Notebook (${state.mistakes.filter(id => state.questions.some(q => q.id === id)).length})</button>
      <button onclick="setRevisionSubTab('bookmarks')" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${
        r.subTab === 'bookmarks' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
      }">Bookmarked (${state.bookmarks.filter(id => state.questions.some(q => q.id === id)).length})</button>
    </div>

    ${list.length === 0 ? `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500">
        ${r.subTab === 'mistakes' ? 'No mistakes recorded yet. Any question you get wrong will appear here automatically.' : 'No bookmarked questions yet.'}
      </div>
    ` : `
      <div class="space-y-4">
        ${list.map(q => {
          const selected = r.answers[q.id];
          return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                <div class="flex flex-wrap gap-2">
                  <span class="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-medium">${escapeHtml(q.exam)} · ${escapeHtml(q.subject)}</span>
                  <span class="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">${escapeHtml(q.topic)}</span>
                </div>
                ${r.subTab === 'mistakes'
                  ? `<button onclick="removeMistake('${q.id}')" class="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold">✓ Mark Mastered</button>`
                  : `<button onclick="toggleBookmark('${q.id}')" class="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500">Remove</button>`
                }
              </div>

              <div class="font-medium mb-4">${renderMathText(q.question)}</div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${q.options.map((opt, idx) => {
                  let cls = 'border-slate-200 dark:border-slate-700 hover:border-brand-500';
                  if (selected !== undefined) {
                    if (idx === q.correctIndex) cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40';
                    else if (idx === selected) cls = 'border-rose-500 bg-rose-50 dark:bg-rose-950/40';
                  }
                  return `
                    <button onclick="selectRevisionOption('${q.id}', ${idx})" class="text-left p-3 rounded-xl border-2 text-sm transition ${cls}">
                      <strong>${String.fromCharCode(65 + idx)}.</strong> ${renderMathText(opt)}
                    </button>
                  `;
                }).join('')}
              </div>

              ${selected !== undefined ? renderExplanationCard(q, r.expTabs, 'setRevisionExpTab') : ''}
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;
}

// ==========================================
// 8. MANAGE QUESTIONS (ADD + BULK JSON IMPORT/EXPORT)
// ==========================================
function toggleDualFormInputs() {
  state.manage.showDualInputs = !state.manage.showDualInputs;
  render();
}

function handleAddQuestion(event) {
  event.preventDefault();
  const f = event.target;
  const newQ = {
    id: 'q-' + Date.now(),
    exam: f.exam.value.trim(),
    post: f.post.value.trim(),
    subject: f.subject.value.trim(),
    topic: f.topic.value.trim(),
    question: f.question.value.trim(),
    options: [f.opt0.value.trim(), f.opt1.value.trim(), f.opt2.value.trim(), f.opt3.value.trim()],
    correctIndex: Number(f.correctIndex.value),
    isPyq: f.isPyq.checked,
    pyqYear: f.isPyq.checked && f.pyqYear.value.trim() ? f.pyqYear.value.trim() : null,
    explanation: f.explanation ? f.explanation.value.trim() : '',
    shortcutExplanation: f.shortcutExplanation && f.shortcutExplanation.value.trim() ? f.shortcutExplanation.value.trim() : null,
    detailedExplanation: f.detailedExplanation && f.detailedExplanation.value.trim() ? f.detailedExplanation.value.trim() : null
  };

  state.questions.unshift(newQ);
  saveQuestions();
  refreshPracticeList();
  f.reset();
  showToast('Question added successfully!');
  render();
}

function importJsonText() {
  const textarea = document.getElementById('bulk-json-input');
  if (!textarea || !textarea.value.trim()) {
    showToast('Paste a valid JSON array first');
    return;
  }
  processJsonImport(textarea.value);
  textarea.value = '';
}

function handleJsonFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => processJsonImport(e.target.result);
  reader.readAsText(file);
  event.target.value = '';
}

function processJsonImport(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array of question objects.');

    let added = 0;
    const existingIds = new Set(state.questions.map(q => q.id));

    parsed.forEach((item, idx) => {
      if (!item.question || !Array.isArray(item.options) || item.options.length < 2) return;
      const id = item.id && !existingIds.has(item.id) ? item.id : `q-imp-${Date.now()}-${idx}`;
      existingIds.add(id);

      state.questions.push({
        id,
        exam: item.exam || 'General',
        post: item.post || 'General',
        subject: item.subject || 'General',
        topic: item.topic || 'General',
        question: item.question,
        options: item.options.slice(0, 4),
        correctIndex: Number(item.correctIndex ?? 0),
        isPyq: Boolean(item.isPyq),
        pyqYear: item.pyqYear || null,
        explanation: item.explanation || '',
        shortcutExplanation: item.shortcutExplanation || null,
        detailedExplanation: item.detailedExplanation || null
      });
      added++;
    });

    saveQuestions();
    refreshPracticeList();
    showToast(`Imported ${added} question(s) successfully!`);
    render();
  } catch (err) {
    alert('Invalid JSON format: ' + err.message);
  }
}

function exportQuestionsJson() {
  const blob = new Blob([JSON.stringify(state.questions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'examprep_question_bank.json';
  a.click();
  URL.revokeObjectURL(url);
}

function deleteQuestion(qId) {
  if (!confirm('Delete this question?')) return;
  state.questions = state.questions.filter(q => q.id !== qId);
  saveQuestions();
  refreshPracticeList();
  showToast('Question deleted');
  render();
}

function resetStarterBank() {
  if (!confirm('Reset question bank back to the original starter questions?')) return;
  state.questions = [...STARTER_QUESTIONS];
  saveQuestions();
  refreshPracticeList();
  showToast('Reset to starter questions');
  render();
}

function renderManageMode() {
  const search = state.manage.search.toLowerCase();
  const filtered = state.questions.filter(q =>
    q.question.toLowerCase().includes(search) ||
    q.exam.toLowerCase().includes(search) ||
    q.subject.toLowerCase().includes(search) ||
    q.topic.toLowerCase().includes(search)
  );

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <!-- Manual Add Form -->
      <form onsubmit="handleAddQuestion(event)" class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <h2 class="text-lg font-bold">Add Question Manually</h2>
        <div class="grid grid-cols-2 gap-2.5">
          <input name="exam" required placeholder="Exam (e.g., JKSSB)" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
          <input name="post" required placeholder="Post (e.g., Junior Assistant)" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
          <input name="subject" required placeholder="Subject (e.g., Quantitative Aptitude)" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
          <input name="topic" required placeholder="Topic (e.g., Algebra)" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
        </div>

        <textarea name="question" required rows="2" placeholder="Question text (supports LaTeX like $x^2 + 1$)" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"></textarea>

        <div class="grid grid-cols-2 gap-2">
          <input name="opt0" required placeholder="Option A" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
          <input name="opt1" required placeholder="Option B" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
          <input name="opt2" required placeholder="Option C" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
          <input name="opt3" required placeholder="Option D" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
        </div>

        <div class="flex flex-wrap items-center gap-3 text-sm">
          <select name="correctIndex" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
            <option value="0">Correct: Option A</option>
            <option value="1">Correct: Option B</option>
            <option value="2">Correct: Option C</option>
            <option value="3">Correct: Option D</option>
          </select>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" name="isPyq" class="rounded" /> Is PYQ
          </label>
          <input name="pyqYear" placeholder="Year (e.g. JKSSB 2024)" class="flex-1 min-w-[130px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
        </div>

        <label class="flex items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-400 cursor-pointer pt-1">
          <input type="checkbox" ${state.manage.showDualInputs ? 'checked' : ''} onchange="toggleDualFormInputs()" />
          Math Mode: Show Dual Explanation Fields (Shortcut + Full Detailed)
        </label>

        ${state.manage.showDualInputs ? `
          <textarea name="shortcutExplanation" rows="2" placeholder="Exam Shortcut / Trick (supports $LaTeX$)" class="w-full rounded-lg border border-brand-300 dark:border-brand-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"></textarea>
          <textarea name="detailedExplanation" rows="3" placeholder="Full Detailed Step-by-Step Method (supports $LaTeX$)" class="w-full rounded-lg border border-brand-300 dark:border-brand-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"></textarea>
        ` : `
          <textarea name="explanation" rows="3" placeholder="Answer Explanation" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"></textarea>
        `}

        <button type="submit" class="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm">
          Add Question
        </button>
      </form>

      <!-- Bulk JSON Import & Backup -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col justify-between space-y-4">
        <div>
          <h2 class="text-lg font-bold mb-1">Bulk Upload (JSON)</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Upload a .json file or paste a JSON array directly (matches the 20-question batch format).</p>

          <input type="file" accept=".json" onchange="handleJsonFileUpload(event)"
            class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 mb-3" />

          <textarea id="bulk-json-input" rows="7" placeholder='Paste JSON array here: [ { "exam": "JKSSB", ... } ]'
            class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 font-mono text-xs"></textarea>

          <button onclick="importJsonText()" class="mt-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm">
            Import Pasted JSON
          </button>
        </div>

        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
          <button onclick="exportQuestionsJson()" class="flex-1 py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">
            ↓ Export Question Bank (JSON)
          </button>
          <button onclick="resetStarterBank()" class="py-2 px-3 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40">
            Reset Starter Data
          </button>
        </div>
      </div>
    </div>

    <!-- Question Bank Table -->
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="font-bold">Stored Questions (${state.questions.length})</h3>
        <input type="text" value="${escapeHtml(state.manage.search)}" oninput="state.manage.search = this.value; render();"
          placeholder="Search exam, subject, topic..." class="w-full sm:w-64 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm" />
      </div>

      <div class="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
        ${filtered.map(q => `
          <div class="py-3 flex items-start justify-between gap-3">
            <div class="text-sm">
              <div class="text-xs text-slate-500 mb-0.5">
                <strong>${escapeHtml(q.exam)}</strong> · ${escapeHtml(q.post)} · ${escapeHtml(q.subject)} (${escapeHtml(q.topic)})
                ${q.isPyq ? `<span class="ml-1 text-amber-600 font-semibold">[${escapeHtml(q.pyqYear || 'PYQ')}]</span>` : ''}
              </div>
              <div class="font-medium">${renderMathText(q.question)}</div>
            </div>
            <button onclick="deleteQuestion('${q.id}')" class="text-xs text-rose-500 hover:underline flex-shrink-0 font-medium">Delete</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ==========================================
// 9. MASTER RENDER & INIT
// ==========================================
function render() {
  updateNavStyles();
  updateMistakeBadge();
  const root = document.getElementById('app-root');

  if (state.activeTab === 'practice') root.innerHTML = renderPracticeMode();
  else if (state.activeTab === 'mock') root.innerHTML = renderMockMode();
  else if (state.activeTab === 'revision') root.innerHTML = renderRevisionMode();
  else if (state.activeTab === 'manage') root.innerHTML = renderManageMode();
}

// Boot the app
loadData();
refreshPracticeList();
render();