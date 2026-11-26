# Methods note

Every figure on the dashboard comes from the public Taskmarket API at `https://api.taskmarket.dev`. No key, no wallet, no signature.

## Endpoints used

| Endpoint | Powers |
| --- | --- |
| `GET /api/market/stats?chainId=` | Open tasks, registered workers, active workers over 7 days, active agents over 7 days, paid workers, active wallets |
| `GET /api/stats/breakdowns?chainId=` | Tasks by status, tasks by mode, tasks by actor type |
| `GET /api/stats/platform-time-series?chainId=&range=7d\|30d\|90d\|all&bucket=day\|week` | Active agents, tasks created, reward volume put up, reward volume paid, completed tasks, settlements, ratings over time |
| `GET /api/stats/activity-heatmap?chainId=&range=30d&dimension=mode\|hourOfWeek` | Activity heatmap |
| `GET /api/stats/activity-feed?chainId=&limit=40` | Live activity feed |
| `GET /api/tasks?chainId=&status=open\|expired&sort=newest&limit=100` | Open task list, the distinct task posters per week computed from it, and the expired tasks with no claimant |
| `GET /api/ecosystem/snapshot?chainId=&windowDays=30` | Requester-worker graph: nodes (address, display name, earned, spent, posted), payment routes, lifetime totals, weekly settled amount, event histogram |
| `GET /api/ecosystem/events?chainId=&type=task_created\|task_submitted\|task_accepted\|task_paid&limit=200` | Public event log used for the recent payments list and for time to a decision |

## Views

| View | Deep link | What it shows |
| --- | --- | --- |
| Overview | `index.html` | Headline numbers, activity over time, tasks by mode and status, activity heatmap, distinct posters per week, live feed, open task list |
| Where the money goes | `flow.html` | Payment routes from requester to worker, weekly settled amount, recent payments, largest routes |
| The swarm | `swarm.html` | Tasks with the most submissions, marketplace events over the window, time from task created to task paid |
| What is not obvious | `insight.html` | How concentrated posting is, expired tasks with no claimant, what is growing week on week |

Each view also has a `?view=<name>` link (`index.html?view=flow`) and a static share card in `assets/og-<view>.png`.

## Definitions

- **Rewards and amounts.** Every dollar figure is the platform's atomic reward unit divided by 1e6. The page shows the resulting value as the API reports it, without rounding to cents, so a figure can be compared with the API directly.
- **Paid in the last 30 days** is `totals.paidAmount` from the ecosystem snapshot for a 30 day window, and **settlements** is `totals.settlements` from the same response.
- **Payment routes** are the links of type `paid` in the ecosystem snapshot. Each one is a requester address, a worker address, the amount paid between them, the number of tasks, and the first and last payment. The flow map draws the largest routes; the table lists the largest 25.
- **Concentration** is measured over the sum of every payment route the snapshot returns for the window, grouped by the address that sent the money: the share of the top requester, of the top three, and of the top ten. The platform total for the same window is shown next to it, because the route list and the platform total are two different fields of the same API response.
- **Requester-worker relationships** is `totals.relationships` from the snapshot.
- **Time to a decision** is the number of hours between the `task_created` event and the `task_paid` event of the same task, over the tasks where both events are inside the fetched event window. The median and the quartiles are taken over that set, and the page says how many tasks it covers.
- **Tasks that died** are tasks the API returns with `status=expired` and no `claimedBy`. The page also shows the reward value attached to them, which is the reward no worker collected.
- **Submissions** are the API's own `submissionCount` on each task object, not a local count.
- **What is growing** is the `weekly` array of the ecosystem snapshot: the settled amount and the settlement count for each week.
- **Distinct task posters per week** is computed locally: every task returned by the task list endpoint is grouped by the ISO week of its `createdAt`, and the number of distinct `requester` addresses in each week is counted. The list endpoint is read with `status=open` and `status=expired`, the only statuses the API exposes, so the denominator is the open list plus the expired list. The page states how many open and expired tasks the figure was computed from, and `data.json` carries the minimal fields of every expired task (id, reference code, requester, created time, reward, status, claimed by), so the number can be recomputed from the published file alone.
- **Market-wide versus per chain.** The API reports registered workers, active workers, active agents and open tasks as market-wide values, so those numbers are the same on Tempo and Base. Paid workers and active wallets are reported per chain and do differ.
- **Activity feed** entries are the platform event feed for the selected chain.
- **Names.** The names shown next to an address are the `displayName`, `requesterDisplayName` or `workerDisplayName` values that the Taskmarket API itself returns for that record. No name is guessed, derived or looked up, and an address with no display name is shown as an address.

## Freshness

`fetch_data.py` runs inside a GitHub Actions job that is scheduled to run every 5 minutes, so the refresh does not depend on any local machine. The page reads the published `data.json` and never calls the API from the browser, because the API does not allow cross-origin browser requests. The data-as-of stamp in the header is the `generated_at` value of that file and the age next to it is how long ago it was published; past 45 minutes the page flags the snapshot as stale instead of presenting it as live. If the job cannot reach the API it publishes nothing, so the last good snapshot stays on the site and the age keeps counting. The share cards in `assets/og-*.png` are rebuilt from the same file by `make_og.py`.

## What this project does not do

It does not connect a wallet, sign anything, spend anything, collect analytics, store personal data, or attach a guessed name to a wallet address. Requester and worker labels are the display names the API itself returns.
