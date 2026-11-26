# -*- coding: utf-8 -*-
"""fetch_data.py - server-side data pull for the Taskmarket live visualizer.

Runs on a 5-minute schedule in GitHub Actions and writes data.json beside index.html.
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
FLOW_WINDOW = 30          # days, window of the ecosystem snapshot
EVENT_LIMIT = 200         # the events endpoint accepts at most 200 rows


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


def usd_atomic(value):
    """Platform atomic reward units -> US dollars, or None when absent."""
    if value is None:
        return None
    try:
        return round(int(value) / 1e6, 4)
    except Exception:
        return None


def brief_task(t):
    desc = t.get("description") or ""
    title = desc.split("\n")[0].strip()[:140]
    return {"id": t.get("id"), "ref": t.get("referenceCode"), "title": title,
            "mode": t.get("mode"), "reward_usd": usd_atomic(t.get("reward")), "status": t.get("status"),
            "created_at": t.get("createdAt"), "expiry_at": t.get("expiryTime"),
            "requester": t.get("requester"), "requester_name": t.get("requesterDisplayName"),
            "submissions": t.get("submissionCount"), "tags": (t.get("tags") or [])[:8],
            "claimed_by": t.get("claimedBy"), "claimed_at": t.get("claimedAt"),
            "worker_name": t.get("workerDisplayName")}


def expired_task(t):
    """Minimal expired-task record, so every published number can be recomputed
    from the public data.json alone."""
    return {"id": t.get("id"), "ref": t.get("referenceCode"),
            "requester": t.get("requester"), "requester_name": t.get("requesterDisplayName"),
            "created_at": t.get("createdAt"), "reward_usd": usd_atomic(t.get("reward")),
            "status": t.get("status"), "claimed_by": t.get("claimedBy"),
            "claimed_at": t.get("claimedAt"), "worker_name": t.get("workerDisplayName"),
            "mode": t.get("mode"), "submissions": t.get("submissionCount")}


def eco_snapshot(chain_id):
    return get("/api/ecosystem/snapshot?chainId=%d&windowDays=%d" % (chain_id, FLOW_WINDOW))


def eco_events(chain_id, etype=None, limit=EVENT_LIMIT):
    path = "/api/ecosystem/events?chainId=%d&limit=%d&order=newest" % (chain_id, limit)
    if etype:
        path += "&type=" + etype
    try:
        d = get(path)
    except Exception:
        return []
    return d.get("items") or []


def parse_at(iso):
    if not iso:
        return None
    try:
        return dt.datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=dt.timezone.utc)
    except Exception:
        return None


def build_flow(snapshot, events_by_type, task_index):
    """Turn the ecosystem snapshot and the public event log into the money
    flow, swarm and concentration figures the page shows."""
    nodes = {n.get("address"): n for n in (snapshot.get("nodes") or []) if n.get("address")}
    links = []
    for l in (snapshot.get("links") or []):
        if l.get("type") != "paid":
            continue
        src, tgt = l.get("source"), l.get("target")
        if not src or not tgt:
            continue
        sn, tn = nodes.get(src) or {}, nodes.get(tgt) or {}
        links.append({"from": src, "from_name": sn.get("displayName"),
                      "to": tgt, "to_name": tn.get("displayName"),
                      "usd": usd_atomic(l.get("paidAmount")), "tasks": l.get("taskCount"),
                      "first_at": l.get("firstAt"), "last_at": l.get("lastAt")})
    links.sort(key=lambda r: -(r.get("usd") or 0))

    paid_total = round(sum(l.get("usd") or 0 for l in links), 4)
    by_src = {}
    for l in links:
        by_src[l["from"]] = round((by_src.get(l["from"]) or 0) + (l.get("usd") or 0), 4)
    src_rank = sorted(by_src.items(), key=lambda kv: -kv[1])

    def share(n):
        if not src_rank or not paid_total:
            return None
        return round(sum(v for _, v in src_rank[:n]) / paid_total, 6)

    concentration = {"paid_total_usd": paid_total, "payers": len(by_src), "routes": len(links),
                     "top1_usd": src_rank[0][1] if src_rank else None,
                     "top1_share": share(1), "top3_share": share(3), "top10_share": share(10)}

    def top(key, limit=12):
        rows = []
        for n in (snapshot.get("nodes") or []):
            v = usd_atomic(n.get(key))
            if v is None:
                continue
            rows.append({"address": n.get("address"), "name": n.get("displayName"),
                         "usd": v, "tasks": n.get("completedTasks"), "kind": n.get("kind"),
                         "last_active": n.get("lastActiveAt")})
        rows.sort(key=lambda r: -(r.get("usd") or 0))
        return rows[:limit]

    lifetime = {k: v for k, v in (snapshot.get("lifetime") or {}).items() if k != "sources"}
    lifetime["paidAmount"] = usd_atomic(lifetime.get("paidAmount"))
    lifetime["settledAmount"] = usd_atomic(lifetime.get("settledAmount"))
    lifetime["medianPayout"] = usd_atomic(lifetime.get("medianPayout"))
    lifetime["largestPayout"] = usd_atomic(lifetime.get("largestPayout"))
    lifetime["feeAmount"] = usd_atomic(lifetime.get("feeAmount"))
    weekly = []
    for w in ((snapshot.get("lifetime") or {}).get("weekly") or []):
        weekly.append({"start": w.get("start"), "usd": usd_atomic(w.get("paidAmount")),
                        "settlements": w.get("settlements")})

    totals = dict(snapshot.get("totals") or {})
    totals["paidAmount"] = usd_atomic(totals.get("paidAmount"))

    # --- swarm: how many agents converged on one task -------------------
    swarm = []
    for tid, ev in (events_by_type.get("paid") or {}).items():
        row = task_index.get(tid) or {}
        swarm.append({"task_id": tid, "ref": row.get("ref"),
                      "title": ev.get("taskTitle") or row.get("title"), "mode": row.get("mode"),
                      "submissions": row.get("submissions"),
                      "requester": ev.get("requester"),
                      "requester_name": ev.get("requesterDisplayName"),
                      "worker": ev.get("worker"), "worker_name": ev.get("workerDisplayName"),
                      "amount_usd": usd_atomic(ev.get("amount")), "at": ev.get("at"),
                      "created_at": row.get("created_at")})
    swarm.sort(key=lambda r: -(r.get("amount_usd") or 0))

    # --- time to a decision: task_created -> task_paid -------------------
    created = events_by_type.get("created") or {}
    paid = events_by_type.get("paid") or {}
    gaps = []
    for tid, pe in paid.items():
        ce = created.get(tid)
        if not ce:
            continue
        c_at, p_at = parse_at(ce.get("at")), parse_at(pe.get("at"))
        if not c_at or not p_at:
            continue
        hours = (p_at - c_at).total_seconds() / 3600.0
        if hours >= 0:
            gaps.append(round(hours, 2))
    gaps.sort()
    def pct(p):
        if not gaps:
            return None
        i = min(len(gaps) - 1, max(0, int(round(p * (len(gaps) - 1)))))
        return gaps[i]

    buckets = []
    edges = [0, 1, 6, 24, 72, 168, 336, 100000]
    labels = ["under 1h", "1-6h", "6-24h", "1-3d", "3-7d", "7-14d", "14d+"]
    for i in range(len(edges) - 1):
        n = sum(1 for g in gaps if edges[i] <= g < edges[i + 1])
        buckets.append({"label": labels[i], "count": n})

    counts = dict(events_by_type.get("counts") or {})

    converged = []
    for tid, row in task_index.items():
        subs = row.get("submissions")
        if not subs:
            continue
        pe = (events_by_type.get("paid") or {}).get(tid)
        converged.append({"task_id": tid, "ref": row.get("ref"), "title": row.get("title"),
                          "mode": row.get("mode"), "submissions": subs,
                          "status": row.get("status"), "reward_usd": row.get("reward_usd"),
                          "created_at": row.get("created_at"), "requester": row.get("requester"),
                          "requester_name": row.get("requester_name"),
                          "claimed_by": row.get("claimed_by"), "claimed_at": row.get("claimed_at"),
                          "worker_name": row.get("worker_name"),
                          "paid_usd": usd_atomic(pe.get("amount")) if pe else None,
                          "paid_at": pe.get("at") if pe else None})
    converged.sort(key=lambda r: -(r.get("submissions") or 0))

    return {"window": snapshot.get("window"), "totals": totals, "lifetime": lifetime,
            "weekly": weekly, "paid_links": links[:60], "top_payers": top("spent"),
            "top_earners": top("earned"), "swarm": swarm[:30], "recent_payments": swarm[:25],
            "decision": {"n": len(gaps), "median_hours": pct(0.5), "p25_hours": pct(0.25),
                         "p75_hours": pct(0.75), "buckets": buckets},
            "histogram": snapshot.get("histogram") or [], "event_counts": counts,
            "converged": converged[:30], "concentration": concentration}


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
                except Exception:
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

        # --- money flow, swarm and concentration ------------------------
        task_index = {}
        for t in list(tasks) + list(expired):
            row = brief_task(t)
            task_index[row["id"]] = row
        try:
            snapshot = eco_snapshot(cid)
        except Exception:
            snapshot = {}
        events_by_type = {"counts": {}}
        for kind in ["created", "submitted", "accepted", "paid"]:
            items = eco_events(cid, "task_" + kind)
            events_by_type["counts"]["task_" + kind] = len(items)
            if kind in ("created", "paid"):
                seen = {}
                for ev in items:
                    tid = ev.get("taskId")
                    if tid and tid not in seen:
                        seen[tid] = ev
                events_by_type[kind] = seen
            else:
                events_by_type[kind] = items
        flow = build_flow(snapshot, events_by_type, task_index)

        claimed = [t for t in expired if t.get("claimedBy")]
        unclaimed = [t for t in expired if not t.get("claimedBy")]
        expired_summary = {"expired": len(expired), "claimed": len(claimed),
                           "unclaimed": len(unclaimed),
                           "claimed_reward_usd": round(sum(usd_atomic(t.get("reward")) or 0 for t in claimed), 4),
                           "unclaimed_reward_usd": round(sum(usd_atomic(t.get("reward")) or 0 for t in unclaimed), 4)}

        out["chains"][label] = {
            "chain_id": cid,
            "stats": stats,
            "breakdowns": breakdowns,
            "series": series,
            "heatmap": heatmap,
            "feed": feed,
            "tasks": [brief_task(t) for t in tasks],
            "expired_tasks": [expired_task(t) for t in expired],
            "expired_summary": expired_summary,
            "weekly_posters": [{"week": k, "posters": len(v)} for k, v in sorted(posters.items())],
            "weekly_posters_basis": "Distinct requester addresses per ISO week, computed from the open + expired task list (the only statuses the API exposes).",
            "task_counts": {"open": len(tasks), "expired_seen": len(expired)},
            "flow": flow,
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
        fl = ch["flow"]
        print(label, "flow paid_links=", len(fl["paid_links"]), "converged=", len(fl["converged"]),
              "decision=", json.dumps(fl["decision"], ensure_ascii=False)[:180])
        print(label, "expired_summary=", json.dumps(ch["expired_summary"], ensure_ascii=False))

