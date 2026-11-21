// ==========================================
// AI ONLINE QUESTION FINDER (GEMINI API + GOOGLE SEARCH)
// ==========================================
const AI_STORAGE_KEYS = {
  API_KEY: 'examprep_gemini_api_key_v1',
  MODEL: 'examprep_gemini_model_v1'
};

const aiState = {
  apiKey: localStorage.getItem(AI_STORAGE_KEYS.API_KEY) || '',
  model: localStorage.getItem(AI_STORAGE_KEYS.MODEL) || 'gemini-3.8-flash',
  useWebSearch: true,
  exam: 'JKSSB',
  post: 'Junior Assistant',
  subject: 'General Awareness (with J&K UT)',
  topic: '',
  questionType: 'MIX', // MIX | PYQ | PRACTICE
  count: 5,
  loading: false,
  statusText: '',
  errorText: '',
  lastModeBadge: '',
  sources: [],
  fetchedQuestions: [],
  answers: {},  // { qId: selectedIndex }
  expTabs: {}   // { qId: 'shortcut' | 'detailed' }
};

function saveAiSettings() {
  const keyInput = document.getElementById('ai-api-key');
  const modelSelect = document.getElementById('ai-model');
  if (keyInput) {
    aiState.apiKey = keyInput.value.trim();
    localStorage.setItem(AI_STORAGE_KEYS.API_KEY, aiState.apiKey);
  }
  if (modelSelect) {
    aiState.model = modelSelect.value;
    localStorage.setItem(AI_STORAGE_KEYS.MODEL, aiState.model);
  }
  showToast('API settings saved in this browser');
  render();
}

function clearAiKey() {
  aiState.apiKey = '';
  localStorage.removeItem(AI_STORAGE_KEYS.API_KEY);
  showToast('API key cleared');
  render();
}

function updateAiField(field, value) {
  aiState[field] = value;
}

function selectAiOption(qId, optIdx) {
  if (aiState.answers[qId] !== undefined) return;
  aiState.answers[qId] = optIdx;
  const q = aiState.fetchedQuestions.find(item => item.id === qId);
  if (q && optIdx !== q.correctIndex) {
    addMistake(qId);
  }
  render();
}

function setAiExpTab(qId, tab) {
  aiState.expTabs[qId] = tab;
  render();
}

function buildFinderPrompt() {
  const isMath = /math|quant|numerical|aptitude|arithmetic|algebra/i.test(aiState.subject + ' ' + aiState.topic);
  const typeInstruction =
    aiState.questionType === 'PYQ'
      ? 'Focus ONLY on real Previous Year Questions (PYQs) asked in past papers of this exam, setting isPyq to true and pyqYear to the exact exam and year (e.g. "JKSSB 2024" or "SSC CGL 2023").'
      : aiState.questionType === 'PRACTICE'
        ? 'Create high-yield official syllabus-based practice MCQs matching the exam difficulty, setting isPyq to false and pyqYear to null.'
        : 'Include a realistic mix of actual Previous Year Questions (PYQs with accurate pyqYear tags) and syllabus-aligned practice MCQs.';

  const mathInstruction = isMath
    ? `Because this is a Mathematics/Quantitative subject, EVERY question MUST provide:
- "shortcutExplanation": Fast exam trick (ratio, option elimination, direct formula) solvable in under 30 seconds, using valid KaTeX LaTeX ($...$ inline, $$...$$ block).
- "detailedExplanation": Clear step-by-step conceptual method using KaTeX LaTeX.
- "explanation": A 1-sentence summary of the final answer.`
    : `For non-math subjects, set "shortcutExplanation" to null and "detailedExplanation" to null, and write a crisp, factual "explanation" explaining why the correct answer is right plus key exam facts or common traps.`;

  return `You are an expert Indian competitive exam question curator.
Find and compile ${aiState.count} accurate, English-only multiple-choice questions for:
- Exam: ${aiState.exam}
- Post / Tier: ${aiState.post}
- Subject: ${aiState.subject}
- Topic: ${aiState.topic || 'High-yield official syllabus topics'}

${typeInstruction}
${mathInstruction}

CRITICAL OUTPUT RULES:
1. Return ONLY a raw valid JSON array. Do not include any intro text, commentary, or markdown outside the JSON array.
2. Every LaTeX backslash inside JSON strings MUST be double-escaped (e.g. "\\\\frac{1}{2}", "\\\\times", "\\\\%").
3. Randomize the correct option index across 0, 1, 2, and 3.
4. Use this EXACT JSON object schema for each item:
[
  {
    "exam": "${aiState.exam}",
    "post": "${aiState.post}",
    "subject": "${aiState.subject}",
    "topic": "Specific Topic Name",
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "isPyq": true,
    "pyqYear": "JKSSB 2024",
    "explanation": "Clear explanation of the right answer",
    "shortcutExplanation": null,
    "detailedExplanation": null
  }
]`;
}

function extractJsonArray(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('Could not find a valid JSON array in the AI response.');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callGeminiApi(prompt, enableSearch) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiState.model)}:generateContent?key=${encodeURIComponent(aiState.apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4 }
  };

  if (enableSearch) {
    body.tools = [{ google_search: {} }];
  } else {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function findQuestionsOnline(event) {
  event.preventDefault();
  const f = event.target;

  aiState.exam = f.exam.value.trim() || 'JKSSB';
  aiState.post = f.post.value.trim() || 'Junior Assistant';
  aiState.subject = f.subject.value.trim() || 'General Awareness';
  aiState.topic = f.topic.value.trim();
  aiState.questionType = f.questionType.value;
  aiState.count = Number(f.count.value) || 5;
  aiState.useWebSearch = f.useWebSearch.checked;

  if (!aiState.apiKey) {
    aiState.errorText = 'Paste your free Gemini API key above and click Save Key first.';
    render();
    return;
  }

  aiState.loading = true;
  aiState.errorText = '';
  aiState.statusText = aiState.useWebSearch
    ? 'Searching online and generating verified answers & explanations...'
    : 'Generating syllabus questions, answers & explanations...';
  aiState.sources = [];
  render();

  const prompt = buildFinderPrompt();

  try {
    let data;
    let usedSearch = aiState.useWebSearch;

    try {
      data = await callGeminiApi(prompt, usedSearch);
    } catch (firstErr) {
      // If Google Search grounding requires billing on this API key, automatically fall back cleanly
      if (usedSearch) {
        aiState.statusText = 'Live Web Search unavailable on this key tier — switching to standard AI generation...';
        render();
        usedSearch = false;
        data = await callGeminiApi(prompt, false);
      } else {
        throw firstErr;
      }
    }

    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.map(p => p.text || '').join('\n');
    if (!text.trim()) throw new Error('Empty response returned by Gemini API.');

    const parsed = extractJsonArray(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('No questions were returned. Try broadening the topic.');
    }

    // Collect cited web sources if Google Search Grounding was active
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    aiState.sources = chunks
      .map(c => c.web)
      .filter(w => w && w.uri)
      .slice(0, 6);

    aiState.lastModeBadge = usedSearch
      ? '🌐 Grounded with Live Google Search'
      : '✨ Generated via Gemini AI (Free Tier)';

    // Normalize, deduplicate, and auto-save into your main question bank
    const existingSet = new Set(state.questions.map(q => q.question.trim().toLowerCase()));
    const freshList = [];
    let newlySaved = 0;

    parsed.forEach((item, idx) => {
      if (!item.question || !Array.isArray(item.options) || item.options.length < 4) return;
      const cleanQ = {
        id: `ai-${Date.now()}-${idx}`,
        exam: item.exam || aiState.exam,
        post: item.post || aiState.post,
        subject: item.subject || aiState.subject,
        topic: item.topic || aiState.topic || 'General',
        question: String(item.question).trim(),
        options: item.options.slice(0, 4).map(o => String(o)),
        correctIndex: Math.min(3, Math.max(0, Number(item.correctIndex ?? 0))),
        isPyq: Boolean(item.isPyq),
        pyqYear: item.isPyq && item.pyqYear ? String(item.pyqYear) : null,
        explanation: String(item.explanation || '').trim(),
        shortcutExplanation: item.shortcutExplanation ? String(item.shortcutExplanation).trim() : null,
        detailedExplanation: item.detailedExplanation ? String(item.detailedExplanation).trim() : null
      };

      freshList.push(cleanQ);

      const normKey = cleanQ.question.toLowerCase();
      if (!existingSet.has(normKey)) {
        existingSet.add(normKey);
        state.questions.unshift(cleanQ);
        newlySaved++;
      }
    });

    if (newlySaved > 0) {
      saveQuestions();
      refreshPracticeList();
    }

    aiState.fetchedQuestions = freshList;
    aiState.answers = {};
    aiState.expTabs = {};
    aiState.loading = false;
    aiState.statusText = '';
    showToast(`Found ${freshList.length} questions (${newlySaved} auto-saved to bank)`);
    render();
  } catch (err) {
    aiState.loading = false;
    aiState.statusText = '';
    aiState.errorText = `Fetch failed: ${err.message}`;
    render();
  }
}

function downloadPermanentQuestionsJs() {
  if (typeof exportQuestionsJs === 'function') {
    exportQuestionsJs();
    return;
  }
  const fileContent =
    `const EXAM_CONFIG = ${JSON.stringify(EXAM_CONFIG, null, 2)};\n\n` +
    `const STARTER_QUESTIONS = ${JSON.stringify(state.questions, null, 2)};\n`;
  const blob = new Blob([fileContent], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'questions.js';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded updated questions.js');
}

function renderAiFinderMode() {
  const a = aiState;
  const hasKey = Boolean(a.apiKey);

  return `
    <div class="space-y-6">
      <!-- API Settings Card -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 class="text-lg font-bold">✨ Find Questions Online (Auto-Fetch)</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Automatically finds syllabus MCQs &amp; PYQs with instant explanations and KaTeX Math Shortcuts—saved straight to your question bank.
            </p>
          </div>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
            class="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
            Get Free Gemini API Key ↗
          </a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
          <div class="md:col-span-6">
            <label class="block text-xs font-medium text-slate-500 mb-1">Gemini API Key (saved only in your browser)</label>
            <input id="ai-api-key" type="password" value="${escapeHtml(a.apiKey)}" placeholder="AIzaSy..."
              class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-mono" />
          </div>
          <div class="md:col-span-3">
            <label class="block text-xs font-medium text-slate-500 mb-1">Model</label>
            <select id="ai-model" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
              <option value="gemini-3.8-flash" ${a.model === 'gemini-3.8-flash' ? 'selected' : ''}>Gemini 3.8 Flash (Recommended)</option>
              <option value="gemini-4-hydrogen" ${a.model === 'gemini-4-hydrogen' ? 'selected' : ''}>Gemini 4 Hydrogen</option>
              <option value="gemini-3.5-flash-lite" ${a.model === 'gemini-3.5-flash-lite' ? 'selected' : ''}>Gemini 3.5 Flash-Lite (Fastest)</option>
            </select>
          </div>
          <div class="md:col-span-3 flex gap-2">
            <button type="button" onclick="saveAiSettings()" class="flex-1 py-2 px-3 rounded-xl bg-slate-900 dark:bg-brand-600 text-white text-xs sm:text-sm font-semibold hover:opacity-90">
              ${hasKey ? 'Update Key' : 'Save Key'}
            </button>
            ${hasKey ? `<button type="button" onclick="clearAiKey()" class="py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-rose-500">Clear</button>` : ''}
          </div>
        </div>
      </div>

      <!-- Search & Fetch Form -->
      <form onsubmit="findQuestionsOnline(event)" class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Exam</label>
            <input name="exam" value="${escapeHtml(a.exam)}" list="exam-suggestions" required
              class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
            <datalist id="exam-suggestions">
              <option value="JKSSB"></option>
              <option value="SSC CGL"></option>
              <option value="JKP SI"></option>
              <option value="RRB NTPC"></option>
            </datalist>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Post / Tier</label>
            <input name="post" value="${escapeHtml(a.post)}" list="post-suggestions" required
              class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
            <datalist id="post-suggestions">
              <option value="Junior Assistant"></option>
              <option value="Police Constable"></option>
              <option value="Tier-1"></option>
              <option value="Assistant Compiler"></option>
              <option value="Veterinary Pharmacist"></option>
            </datalist>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Subject</label>
            <input name="subject" value="${escapeHtml(a.subject)}" list="subject-suggestions" required
              class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
            <datalist id="subject-suggestions">
              <option value="General Awareness (with J&K UT)"></option>
              <option value="Elementary Mathematics"></option>
              <option value="Quantitative Aptitude"></option>
              <option value="Basic Concepts of Computers"></option>
              <option value="General English"></option>
              <option value="Analytical Aptitude & Reasoning"></option>
            </datalist>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Specific Topic (Optional)</label>
            <input name="topic" value="${escapeHtml(a.topic)}" placeholder="e.g. J&K Rivers, Profit & Loss, MS Excel"
              class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div class="flex flex-wrap items-center gap-3">
            <select name="questionType" class="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm">
              <option value="MIX" ${a.questionType === 'MIX' ? 'selected' : ''}>PYQs + Syllabus Mix</option>
              <option value="PYQ" ${a.questionType === 'PYQ' ? 'selected' : ''}>Real PYQs Only</option>
              <option value="PRACTICE" ${a.questionType === 'PRACTICE' ? 'selected' : ''}>Syllabus Practice MCQs</option>
            </select>

            <select name="count" class="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm">
              <option value="5" ${a.count === 5 ? 'selected' : ''}>5 Questions</option>
              <option value="10" ${a.count === 10 ? 'selected' : ''}>10 Questions</option>
              <option value="15" ${a.count === 15 ? 'selected' : ''}>15 Questions</option>
            </select>

            <label class="flex items-center gap-1.5 text-xs sm:text-sm font-medium cursor-pointer">
              <input type="checkbox" name="useWebSearch" ${a.useWebSearch ? 'checked' : ''} class="rounded" />
              Use Live Google Web Search
            </label>
          </div>

          <button type="submit" ${a.loading ? 'disabled' : ''}
            class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold transition">
            ${a.loading ? '⏳ Finding Questions...' : '🔍 Find Questions Online'}
          </button>
        </div>

        ${a.statusText ? `<div class="text-xs sm:text-sm text-brand-600 dark:text-brand-400 font-medium">${escapeHtml(a.statusText)}</div>` : ''}
        ${a.errorText ? `<div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs sm:text-sm text-rose-700 dark:text-rose-300">${escapeHtml(a.errorText)}</div>` : ''}
      </form>

      <!-- Live Fetched Questions Ready to Practice -->
      ${a.fetchedQuestions.length > 0 ? `
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-base">Fetched Questions (${a.fetchedQuestions.length})</h3>
              ${a.lastModeBadge ? `<span class="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-semibold">${escapeHtml(a.lastModeBadge)}</span>` : ''}
            </div>
            <div class="flex gap-2">
              <button onclick="downloadPermanentQuestionsJs()" class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">
                💾 Save All to questions.js
              </button>
              <button onclick="switchTab('practice')" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
                Open Full Bank (${state.questions.length}) →
              </button>
            </div>
          </div>

          ${a.sources.length > 0 ? `
            <div class="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex flex-wrap items-center gap-2">
              <span class="font-semibold text-slate-600 dark:text-slate-400">Web Sources:</span>
              ${a.sources.map(s => `<a href="${escapeHtml(s.uri)}" target="_blank" rel="noopener noreferrer" class="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-brand-600 dark:text-brand-400 hover:underline">${escapeHtml(s.title || s.uri)}</a>`).join('')}
            </div>
          ` : ''}

          ${a.fetchedQuestions.map((q, qIdx) => {
            const selected = a.answers[q.id];
            const isBookmarked = state.bookmarks.includes(q.id);
            return `
              <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-bold">Q${qIdx + 1}</span>
                    <span class="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-medium">${escapeHtml(q.subject)} — ${escapeHtml(q.topic)}</span>
                    ${q.isPyq ? `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">${escapeHtml(q.pyqYear || 'PYQ')}</span>` : ''}
                  </div>
                  <button onclick="toggleBookmark('${q.id}')" class="px-2.5 py-1 rounded-lg border text-xs font-medium ${
                    isBookmarked ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }">${isBookmarked ? '★ Bookmarked' : '☆ Bookmark'}</button>
                </div>

                <div class="text-base font-medium leading-relaxed mb-4">${renderMathText(q.question)}</div>

                <div class="space-y-2">
                  ${q.options.map((opt, idx) => {
                    const letter = String.fromCharCode(65 + idx);
                    let cls = 'border-slate-200 dark:border-slate-700 hover:border-brand-500';
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
                      <button onclick="selectAiOption('${q.id}', ${idx})" ${selected !== undefined ? 'disabled' : ''}
                        class="w-full text-left p-3 rounded-xl border-2 flex items-start gap-3 transition ${cls}">
                        <span class="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold ${badgeCls}">${letter}</span>
                        <span class="text-sm pt-0.5">${renderMathText(opt)}</span>
                      </button>
                    `;
                  }).join('')}
                </div>

                ${selected !== undefined ? renderExplanationCard(q, a.expTabs, 'setAiExpTab') : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// Plug cleanly into app.js render() without editing app.js
const _origExamPrepRender = render;
render = function () {
  _origExamPrepRender();
  if (state.activeTab === 'ai') {
    const root = document.getElementById('app-root');
    if (root) root.innerHTML = renderAiFinderMode();
  }
};