#!/usr/bin/env python3
"""Еженедельный статус-отчёт проекта из данных GitHub.

Принцип: ВСЕ числа считает скрипт; модель только формулирует текст вокруг готовых
фактов. После генерации скрипт проверяет, что каждое число в тексте модели есть среди
фактов, и перечисляет все, которых там нет.

Запуск:
  GITHUB_TOKEN=... GROQ_API_KEY=... python tools/pm_report.py --repo madyokkaa/TableFlow --days 7
  python tools/pm_report.py --repo madyokkaa/TableFlow --since 2026-11-01 --until 2026-11-14 --no-llm
"""
import argparse, datetime as dt, json, os, re, sys, time
import requests

API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
GROQ_URL = os.environ.get("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions")
MODEL = os.environ.get("GROQ_LLM_MODEL", "openai/gpt-oss-20b")
STALE_DAYS = 7
PROMPT_VERSION = "pm_report_v1"

SYSTEM = (
    "Ты помощник менеджера проекта. Тебе дан JSON FACTS с числами и названиями за период. "
    "Напиши краткий статус-отчёт на русском языке по трём разделам: "
    "«Итоги периода» (до 5 предложений), «Риски и зависшее» (маркированный список), "
    "«Что сделать дальше» (до 3 пунктов). Правила: используй ТОЛЬКО числа, даты, логины и названия из FACTS; "
    "не вычисляй новых чисел и процентов; не оценивай сроки и не делай прогнозов; "
    "если данных для раздела нет, так и напиши одной строкой. Без вступлений и выводов вне разделов."
)

def parse_day(s):
    return dt.datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)

def iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")

def when(s):
    return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc) if s else None

class GH:
    def __init__(self, repo, token):
        self.repo = repo
        self.h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if token: self.h["Authorization"] = f"Bearer {token}"
    def get(self, path, params=None, limit_pages=10):
        out, page = [], 1
        while page <= limit_pages:
            p = dict(params or {}, per_page=100, page=page)
            r = requests.get(f"{API}/repos/{self.repo}{path}", headers=self.h, params=p, timeout=60)
            r.raise_for_status()
            j = r.json()
            items = j.get("workflow_runs", j) if isinstance(j, dict) else j
            out += items
            if len(items) < 100: break
            page += 1
        return out

def collect(repo, token, since, until):
    gh = GH(repo, token)
    commits = gh.get("/commits", {"since": iso(since), "until": iso(until)})
    by_author = {}
    for c in commits:
        a = (c.get("author") or {}).get("login") or c["commit"]["author"]["name"]
        by_author[a] = by_author.get(a, 0) + 1
    prs = gh.get("/pulls", {"state": "all", "sort": "updated", "direction": "desc"})
    prs_in = [p for p in prs if since <= when(p["created_at"]) < until or (p.get("merged_at") and since <= when(p["merged_at"]) < until)]
    merged = [p for p in prs_in if p.get("merged_at") and since <= when(p["merged_at"]) < until]
    issues_all = [i for i in gh.get("/issues", {"state": "all", "since": iso(since)}) if "pull_request" not in i]
    opened = [i for i in issues_all if since <= when(i["created_at"]) < until]
    closed = [i for i in issues_all if i.get("closed_at") and since <= when(i["closed_at"]) < until]
    open_now = [i for i in gh.get("/issues", {"state": "open"}) if "pull_request" not in i]
    stale = [i for i in open_now if (until - when(i["updated_at"])).days >= STALE_DAYS]
    bugs = [i for i in open_now if any(l["name"].lower() in ("bug", "баг") for l in i.get("labels", []))]
    runs = gh.get("/actions/runs", {"created": f"{since:%Y-%m-%d}..{until:%Y-%m-%d}"}, limit_pages=5)
    done = [r for r in runs if r.get("conclusion")]
    ok = [r for r in done if r["conclusion"] == "success"]
    return {
        "repo": repo, "period_from": f"{since:%Y-%m-%d}", "period_to": f"{until - dt.timedelta(days=1):%Y-%m-%d}",
        "commits_total": len(commits), "commits_by_author": dict(sorted(by_author.items(), key=lambda x: -x[1])),
        "prs_opened_or_merged": len(prs_in), "prs_merged": len(merged),
        "issues_opened": len(opened), "issues_closed": len(closed), "issues_open_now": len(open_now),
        "open_bugs": len(bugs),
        "stale_issues_days": STALE_DAYS, "stale_issues": [{"number": i["number"], "title": i["title"][:80], "days_without_update": (until - when(i["updated_at"])).days} for i in stale][:10],
        "ci_runs_finished": len(done), "ci_runs_success": len(ok), "ci_runs_failed": len(done) - len(ok),
    }

def facts_markdown(f):
    L = [f"## Факты за период {f['period_from']} — {f['period_to']} (посчитаны скриптом)", "",
         "| Показатель | Значение |", "| --- | --- |",
         f"| Коммитов | {f['commits_total']} |", f"| PR открыто или влито | {f['prs_opened_or_merged']} (влито {f['prs_merged']}) |",
         f"| Задач открыто / закрыто | {f['issues_opened']} / {f['issues_closed']} |", f"| Открытых задач сейчас | {f['issues_open_now']} |",
         f"| Открытых багов | {f['open_bugs']} |",
         f"| Запусков CI завершено / успешно / неуспешно | {f['ci_runs_finished']} / {f['ci_runs_success']} / {f['ci_runs_failed']} |", ""]
    if f["commits_by_author"]:
        L += ["Коммиты по авторам: " + ", ".join(f"{a} — {n}" for a, n in f["commits_by_author"].items()), ""]
    if f["stale_issues"]:
        L += [f"Задачи без обновлений {f['stale_issues_days']} дней и более:"] + [f"- #{i['number']} {i['title']} ({i['days_without_update']} дн.)" for i in f["stale_issues"]] + [""]
    return "\n".join(L)

def ask_llm(facts, key):
    body = {"model": MODEL, "temperature": 0, "seed": 42, "max_completion_tokens": 1500,
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "FACTS:\n" + json.dumps(facts, ensure_ascii=False)}]}
    if "gpt-oss" in MODEL: body["reasoning_effort"] = "low"
    for _ in range(5):
        t0 = time.time()
        r = requests.post(GROQ_URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=120)
        if r.status_code == 429:
            time.sleep(float(r.headers.get("retry-after", 10)) + 1); continue
        r.raise_for_status()
        j = r.json(); u = j.get("usage", {})
        return j["choices"][0]["message"]["content"].strip(), {"model": MODEL, "prompt_version": PROMPT_VERSION, "prompt_tokens": u.get("prompt_tokens"), "completion_tokens": u.get("completion_tokens"), "seconds": round(time.time() - t0, 2)}
    raise RuntimeError("Groq: слишком много ответов 429")

def numbers(text):
    return set(re.findall(r"\d+", text))

def unverified_numbers(llm_text, facts):
    allowed = numbers(json.dumps(facts, ensure_ascii=False))
    return sorted(numbers(llm_text) - allowed, key=int)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", "madyokkaa/TableFlow"))
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--since"); ap.add_argument("--until")
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--out", default="reports")
    a = ap.parse_args()
    until = parse_day(a.until) + dt.timedelta(days=1) if a.until else dt.datetime.now(dt.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    since = parse_day(a.since) if a.since else until - dt.timedelta(days=a.days)
    facts = collect(a.repo, os.environ.get("GITHUB_TOKEN"), since, until)
    parts = [f"# Статус-отчёт {a.repo}", "", facts_markdown(facts)]
    meta = None; bad = None; text = None
    key = os.environ.get("GROQ_API_KEY")
    if not a.no_llm and key:
        try:
            text, meta = ask_llm(facts, key)
            bad = unverified_numbers(text, facts)
            parts += ["## Текст модели (черновик, проверить перед отправкой)", "", text, "",
                      f"> Модель: {meta['model']}, версия промпта {meta['prompt_version']}. Числа в тексте, которых нет в фактах: "
                      + (", ".join(bad) if bad else "не найдено") + "."]
        except Exception as e:
            parts += [f"> Текст модели недоступен ({type(e).__name__}); отчёт содержит только числа."]
    else:
        parts += ["> Текст модели не запрашивался; отчёт содержит только числа."]
    os.makedirs(a.out, exist_ok=True)
    stem = f"{a.out}/{facts['period_from']}_{facts['period_to']}"
    open(stem + ".md", "w", encoding="utf-8").write("\n".join(parts) + "\n")
    json.dump({"facts": facts, "llm_text": text, "llm_meta": meta, "unverified_numbers": bad}, open(stem + ".json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n".join(parts))

if __name__ == "__main__":
    main()
