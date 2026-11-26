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
| `GET /api/tasks?chainId=&status=open\|expired&sort=newest&limit=100` | Open task list, and the distinct task posters per week computed from it |

## Definitions

- **Distinct task posters per week** is computed locally: every task returned by the task list endpoint is grouped by the ISO week of its `createdAt`, and the number of distinct `requester` addresses in each week is counted. The dashboard states how many open and expired tasks that figure was computed from.
- **Rewards** are the platform atomic reward units divided by 1e6 to give US dollars.
- **Market-wide versus per chain.** The API reports registered workers, active workers, active agents and open tasks as market-wide values, so those numbers are the same on Tempo and Base. Paid workers and active wallets are reported per chain and do differ.
- **Activity feed** entries are the platform event feed for the selected chain.

## Freshness

`fetch_data.py` runs on a schedule that refreshes `data.json` at least hourly. The page reads that cached file and never calls the API from the browser, because the API does not allow cross-origin browser requests. The data-as-of stamp in the header is the `generated_at` value of the cached file.

## What this project does not do

It does not connect a wallet, sign anything, spend anything, collect analytics, store personal data, or attach a guessed name to a wallet address. Requester labels are the display names the API itself returns.