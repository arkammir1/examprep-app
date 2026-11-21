import json
import mimetypes
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DB_FILE = ROOT_DIR / "questions-db.json"
STARTER_JS = ROOT_DIR / "questions.js"
FALLBACK_JSON = ROOT_DIR / "jkssb_1000_mcqs.json"

DB_LOCK = threading.Lock()

ALLOWED_MODELS = {
    "gemini-3.8-flash",
    "gemini-4-hydrogen",
    "gemini-3.5-flash-lite",
}

BLOCKED_FILES = {
    ".env",
    "server.py",
    "server.js",
    "questions-db.json",
    "package.json",
}

# ------------------------------------------
# 1. LOAD .env FILE (ZERO DEPENDENCIES)
# ------------------------------------------
def load_env() -> None:
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        os.environ.setdefault(key, val)


load_env()

PORT = int(os.environ.get("PORT", "3000"))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()


# ------------------------------------------
# 2. PERMANENT JSON DATABASE HELPERS
# ------------------------------------------
def load_starter_questions() -> list:
    if STARTER_JS.exists():
        try:
            code = STARTER_JS.read_text(encoding="utf-8")
            match = re.search(r"const\s+STARTER_QUESTIONS\s*=\s*(\[[\s\S]*\])\s*;?", code)
            if match:
                arr_text = match.group(1)
                try:
                    data = json.loads(arr_text)
                    if isinstance(data, list):
                        return data
                except json.JSONDecodeError:
                    # Fallback if questions.js uses unquoted JS object keys
                    quoted = re.sub(r"(?m)^(\s*)([A-Za-z_]\w*)\s*:", r'\1"\2":', arr_text)
                    data = json.loads(quoted)
                    if isinstance(data, list):
                        return data
        except Exception as exc:
            print(f"Warning: could not parse questions.js ({exc})")

    if FALLBACK_JSON.exists():
        try:
            data = json.loads(FALLBACK_JSON.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except Exception:
            pass

    return []


def write_database(questions: list) -> None:
    temp_file = DB_FILE.with_suffix(".json.tmp")
    temp_file.write_text(
        json.dumps(questions, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    os.replace(temp_file, DB_FILE)


def read_database() -> list:
    try:
        return json.loads(DB_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def init_database() -> None:
    if DB_FILE.exists():
        return
    seed = load_starter_questions()
    write_database(seed)
    print(f"Initialized questions-db.json with {len(seed)} permanent questions.")


# ------------------------------------------
# 3. GEMINI API + GOOGLE SEARCH GROUNDING
# ------------------------------------------
def build_prompt(exam: str, post: str, subject: str, topic: str, question_type: str, count: int) -> str:
    is_math = bool(re.search(r"math|quant|numerical|aptitude|arithmetic|algebra", f"{subject} {topic}", re.I))

    if question_type == "PYQ":
        type_instruction = (
            'Focus ONLY on real Previous Year Questions (PYQs) asked in past papers of this exam, '
            'setting isPyq to true and pyqYear to the exact exam and year (e.g. "JKSSB 2024" or "SSC CGL 2023").'
        )
    elif question_type == "PRACTICE":
        type_instruction = (
            "Create high-yield official syllabus-based practice MCQs matching the exam difficulty, "
            "setting isPyq to false and pyqYear to null."
        )
    else:
        type_instruction = (
            "Include a realistic mix of actual Previous Year Questions (PYQs with accurate pyqYear tags) "
            "and syllabus-aligned practice MCQs."
        )

    if is_math:
        math_instruction = (
            "Because this is a Mathematics/Quantitative subject, EVERY question MUST provide:\n"
            '- "shortcutExplanation": Fast exam trick (ratio, option elimination, direct formula) solvable in under 30 seconds, '
            "using valid KaTeX LaTeX ($...$ inline, $$...$$ block).\n"
            '- "detailedExplanation": Clear step-by-step conceptual method using KaTeX LaTeX.\n'
            '- "explanation": A 1-sentence summary of the final answer.'
        )
    else:
        math_instruction = (
            'For non-math subjects, set "shortcutExplanation" to null and "detailedExplanation" to null, '
            'and write a crisp, factual "explanation" explaining why the correct answer is right plus key exam facts or common traps.'
        )

    return f"""You are an expert Indian competitive exam question curator.
Find and compile {count} accurate, English-only multiple-choice questions for:
- Exam: {exam}
- Post / Tier: {post}
- Subject: {subject}
- Topic: {topic or "High-yield official syllabus topics"}

{type_instruction}
{math_instruction}

CRITICAL OUTPUT RULES:
1. Return ONLY a raw valid JSON array. No intro text, commentary, or markdown outside the JSON array.
2. Every LaTeX backslash inside JSON strings MUST be double-escaped (e.g. "\\\\frac{{1}}{{2}}", "\\\\times", "\\\\%").
3. Randomize the correct option index across 0, 1, 2, and 3.
4. Use this EXACT JSON object schema for each item:
[
  {{
    "exam": "{exam}",
    "post": "{post}",
    "subject": "{subject}",
    "topic": "Specific Topic Name",
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "isPyq": true,
    "pyqYear": "JKSSB 2024",
    "explanation": "Clear explanation of the right answer",
    "shortcutExplanation": null,
    "detailedExplanation": null
  }}
]"""


def extract_json_array(raw_text: str) -> list:
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("AI response did not contain a valid JSON array.")
    return json.loads(cleaned[start : end + 1])


def call_gemini(model: str, prompt: str, enable_search: bool) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model)}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4},
    }

    if enable_search:
        payload["tools"] = [{"google_search": {}}]
    else:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("error", {}).get("message", f"HTTP {err.code}")
        except Exception:
            msg = f"HTTP {err.code}: {err_body[:200]}"
        raise RuntimeError(msg) from err


# ------------------------------------------
# 4. HTTP REQUEST HANDLER
# ------------------------------------------
class ExamPrepHandler(BaseHTTPRequestHandler):
    def send_json(self, status: int, data: dict) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def read_json_body(self, max_bytes: int = 15 * 1024 * 1024) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > max_bytes:
            raise ValueError("Request payload too large")
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def serve_static(self, pathname: str) -> None:
        rel_path = "index.html" if pathname == "/" else pathname.lstrip("/")
        base_name = os.path.basename(rel_path)

        if base_name.startswith(".") or base_name.lower() in BLOCKED_FILES:
            self.send_error(403, "Forbidden")
            return

        full_path = (ROOT_DIR / rel_path).resolve()
        if os.path.commonpath([str(ROOT_DIR), str(full_path)]) != str(ROOT_DIR):
            self.send_error(403, "Forbidden")
            return

        if not full_path.exists() or full_path.is_dir():
            self.send_error(404, "Not Found")
            return

        mime_type, _ = mimetypes.guess_type(str(full_path))
        if not mime_type:
            mime_type = "application/octet-stream"
        if mime_type.startswith("text/") or mime_type in ("application/javascript", "application/json"):
            mime_type = f"{mime_type}; charset=utf-8"

        content = full_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        pathname = urllib.parse.urlparse(self.path).path
        try:
            if pathname == "/api/health":
                with DB_LOCK:
                    total = len(read_database())
                has_key = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_real_gemini_api_key_here")
                self.send_json(200, {"ok": True, "hasApiKey": has_key, "totalQuestions": total})
                return

            if pathname == "/api/questions":
                with DB_LOCK:
                    questions = read_database()
                self.send_json(200, {"questions": questions})
                return

            self.serve_static(pathname)
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def do_PUT(self) -> None:
        pathname = urllib.parse.urlparse(self.path).path
        if pathname != "/api/questions":
            self.send_error(404, "Not Found")
            return
        try:
            body = self.read_json_body()
            questions = body.get("questions")
            if not isinstance(questions, list):
                self.send_json(400, {"error": "Expected { questions: [...] }"})
                return
            with DB_LOCK:
                write_database(questions)
            self.send_json(200, {"saved": len(questions)})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def do_POST(self) -> None:
        pathname = urllib.parse.urlparse(self.path).path
        if pathname != "/api/find-questions":
            self.send_error(404, "Not Found")
            return

        try:
            if not GEMINI_API_KEY or GEMINI_API_KEY == "your_real_gemini_api_key_here":
                self.send_json(
                    500,
                    {"error": "GEMINI_API_KEY is missing in your .env file. Add your key and restart server.py."},
                )
                return

            body = self.read_json_body()
            exam = str(body.get("exam") or "JKSSB").strip()
            post = str(body.get("post") or "Junior Assistant").strip()
            subject = str(body.get("subject") or "General Awareness").strip()
            topic = str(body.get("topic") or "").strip()
            q_type = body.get("questionType") if body.get("questionType") in ("MIX", "PYQ", "PRACTICE") else "MIX"
            count = min(20, max(1, int(body.get("count") or 5)))
            model = body.get("model") if body.get("model") in ALLOWED_MODELS else "gemini-3.8-flash"
            use_search = bool(body.get("useWebSearch", True))

            prompt = build_prompt(exam, post, subject, topic, q_type, count)

            try:
                data = call_gemini(model, prompt, use_search)
            except Exception:
                if use_search:
                    use_search = False
                    data = call_gemini(model, prompt, False)
                else:
                    raise

            candidates = data.get("candidates") or []
            candidate = candidates[0] if candidates else {}
            parts = candidate.get("content", {}).get("parts") or []
            text = "\n".join(p.get("text", "") for p in parts if isinstance(p, dict))
            if not text.strip():
                raise RuntimeError("Gemini returned an empty response.")

            parsed = extract_json_array(text)
            ts = int(time.time() * 1000)

            fetched_questions = []
            newly_saved = 0

            with DB_LOCK:
                db = read_database()
                existing_keys = {str(q.get("question", "")).strip().lower() for q in db}

                for idx, item in enumerate(parsed):
                    if not isinstance(item, dict):
                        continue
                    q_text = str(item.get("question") or "").strip()
                    opts = item.get("options")
                    if not q_text or not isinstance(opts, list) or len(opts) < 4:
                        continue

                    is_pyq = bool(item.get("isPyq"))
                    pyq_year = str(item.get("pyqYear")).strip() if (is_pyq and item.get("pyqYear")) else None
                    shortcut = str(item.get("shortcutExplanation")).strip() if item.get("shortcutExplanation") else None
                    detailed = str(item.get("detailedExplanation")).strip() if item.get("detailedExplanation") else None

                    try:
                        correct_idx = min(3, max(0, int(item.get("correctIndex", 0))))
                    except (TypeError, ValueError):
                        correct_idx = 0

                    clean_q = {
                        "id": f"ai-{ts}-{idx}",
                        "exam": str(item.get("exam") or exam),
                        "post": str(item.get("post") or post),
                        "subject": str(item.get("subject") or subject),
                        "topic": str(item.get("topic") or topic or "General"),
                        "question": q_text,
                        "options": [str(o) for o in opts[:4]],
                        "correctIndex": correct_idx,
                        "isPyq": is_pyq,
                        "pyqYear": pyq_year,
                        "explanation": str(item.get("explanation") or "").strip(),
                        "shortcutExplanation": shortcut,
                        "detailedExplanation": detailed,
                    }

                    fetched_questions.append(clean_q)
                    key = q_text.lower()
                    if key not in existing_keys:
                        existing_keys.add(key)
                        db.insert(0, clean_q)
                        newly_saved += 1

                if newly_saved > 0:
                    write_database(db)
                total_in_bank = len(db)

            chunks = candidate.get("groundingMetadata", {}).get("groundingChunks") or []
            sources = []
            for ch in chunks:
                web = ch.get("web") if isinstance(ch, dict) else None
                if isinstance(web, dict) and web.get("uri"):
                    sources.append({"uri": web["uri"], "title": web.get("title") or web["uri"]})
                if len(sources) >= 6:
                    break

            self.send_json(
                200,
                {
                    "questions": fetched_questions,
                    "newlySaved": newly_saved,
                    "totalInBank": total_in_bank,
                    "modeBadge": (
                        "🌐 Grounded with Live Google Search"
                        if use_search
                        else "✨ Generated via Gemini AI (Free Tier)"
                    ),
                    "sources": sources,
                },
            )
        except Exception as exc:
            print(f"API error: {exc}")
            self.send_json(500, {"error": str(exc)})


if __name__ == "__main__":
    init_database()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), ExamPrepHandler)
    has_key = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_real_gemini_api_key_here")
    print(f"ExamPrep Python server running at http://localhost:{PORT}")
    print(f"API Key loaded from .env: {'YES' if has_key else 'NO (edit .env)'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()