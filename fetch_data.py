# -*- coding: utf-8 -*-
"""fetch_data.py - server-side data pull for the Taskmarket live visualizer.

Runs hourly on GitHub Actions and writes data.json beside index.html.
The page never calls the API from the browser: the API does not allow
cross-origin browser requests, so the data is fetched here and cached.

Every number the dashboard shows comes from the public endpoints listed
in methods.md and can be reproduced with no key and no wallet.
"""
import datetime as dt
import json
import os
import ssl
import urllib.request

API = "https://api.taskmarket.dev"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data.json")
CHAINS = [("tempo", 4217), ("base", 8453)]
UA = "taskmarket-live-visualizer/1.0"


def get(path, timeout=60):
    ctx = ssl.create_default_context()
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx))
    req = urllib.request.Request(API + path, headers={"User-Agent": UA, "Accept": "application/json"})
    with op.open(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def all_tasks(chain_id, status, cap=40):
    rows = []
    cursor = None
    for _ in range(cap):
        path = "/api/tasks?chainId=%d&status=%s&sort=newest&limit=100" % (chain_id, status)
        if cursor:
            path += "&cursor=" + str(cursor)
        d = get(path)
        rows.extend(d.get("tasks") or [])
        cursor = d.get("nextCursor")
        if not cursor or not d.get("hasMore"):
            break
    return rows


def week_key(iso):
    try:
        d = dt.datetime.strptime((iso or "")[:10], "%Y-%m-%d")
    except Exception:
        return None
    y, w, _ = d.isocalendar()
    return "%04d-W%02d" % (y, w)


def brief_task(t):
    desc = t.get("description") or ""
    title = desc.split("\n")[0].strip()[:140]
    try:
        reward = round(int(t.get("reward") or 0) / 1e6, 4)
    except Exception:
        reward = 0
    return {"id": t.get("id"), "ref": t.get("referenceCode"), "title": title,
            "mode": t.get("mode"), "reward_usd": reward, "status": t.get("status"),
            "created_at": t.get("createdAt"), "expiry_at": t.get("expiryTime"),
            "requester": t.get("requester"), "requester_name": t.get("requesterDisplayName"),
            "submissions": t.get("submissionCount"), "tags": (t.get("tags") or [])[:8]}


def build():
    out = {"generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "source": API, "chains": {}}
    for label, cid in CHAINS:
        stats = get("/api/market/stats?chainId=%d" % cid)
        breakdowns = get("/api/stats/breakdowns?chainId=%d" % cid)
        series = {}
        for rng in ["7d", "30d", "90d", "all"]:
            for bucket in ["day", "week"]:
                key = "%s_%s" % (rng, bucket)
                try:
                    series[key] = get("/api/stats/platform-time-series?chainId=%d&range=%s&bucket=%s" % (cid, rng, bucket))
                except Exception as e:
                    series[key] = []
        heatmap = {}
        for dim in ["mode", "hourOfWeek"]:
            try:
                heatmap[dim] = get("/api/stats/activity-heatmap?chainId=%d&range=30d&dimension=%s" % (cid, dim))
            except Exception:
                heatmap[dim] = {}
        try:
            feed = get("/api/stats/activity-feed?chainId=%d&limit=40" % cid)
        except Exception:
            feed = {"items": []}
        tasks = all_tasks(cid, "open")
        try:
            expired = all_tasks(cid, "expired")
        except Exception:
            expired = []
        posters = {}
        for t in list(tasks) + list(expired):
            wk = week_key(t.get("createdAt"))
            rq = t.get("requester")
            if wk and rq:
                posters.setdefault(wk, set()).add(rq)
        out["chains"][label] = {
            "chain_id": cid,
            "stats": stats,
            "breakdowns": breakdowns,
            "series": series,
            "heatmap": heatmap,
            "feed": feed,
            "tasks": [brief_task(t) for t in tasks],
            "weekly_posters": [{"week": k, "posters": len(v)} for k, v in sorted(posters.items())],
            "task_counts": {"open": len(tasks), "expired_seen": len(expired)},
        }
    return out


if __name__ == "__main__":
    data = build()
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print("wrote", OUT, os.path.getsize(OUT), "bytes")
    for label, ch in data["chains"].items():
        print(label, "stats=", json.dumps(ch["stats"], ensure_ascii=False)[:220])
        print(label, "tasks=", ch["task_counts"], "series30d_day=", len(ch["series"].get("30d_day") or []),
              "weekly_posters=", len(ch["weekly_posters"]), "feed=", len((ch["feed"] or {}).get("items") or []))