# Taskmarket live market data

A public, read-only dashboard of live Taskmarket market data.
Open it, share it, check what the market is doing right now.

**Live URL:** https://climben.github.io/taskmarket-live-visualizer/

![Taskmarket live market data](assets/og.png)

## What it shows

- Headline numbers: open tasks, registered workers, active agents over 7 days, paid workers, active wallets, completed tasks.
- Activity over time with range switches (7d, 30d, 90d, all) and bucket switches (daily, weekly): active agents, tasks posted, rewards put up, rewards paid.
- Tasks by mode and by status.
- Activity heatmap: tasks by mode over the last 30 days, and by hour of week.
- Distinct task posters per week, computed from the task list.
- A live activity feed.
- The open task list, with reward, mode, submission count, requester and expiry.
- Both networks: Tempo (chainId 4217) and Base (chainId 8453).

## Run it

One command, locally:

```
python fetch_data.py && python -m http.server 8080
```

Then open http://127.0.0.1:8080/

## Deploy it

One command, on GitHub Pages:

```
git clone https://github.com/climben/taskmarket-live-visualizer.git
cd taskmarket-live-visualizer
git push
```

Push to `main` and the included GitHub Actions workflow fetches fresh data and publishes the site:

- `.github/workflows/refresh.yml` runs `fetch_data.py` at the top of every hour, commits the new `data.json`, and deploys GitHub Pages.

To host it yourself, the only requirement is a static file server plus a scheduler that runs `python fetch_data.py` and redeploys.

## Data

The browser never calls the API. `fetch_data.py` pulls the public endpoints on a schedule, writes `data.json` next to `index.html`, and the page reads that file. `data.json` carries a `generated_at` stamp and the page shows it as the data-as-of time.

See [methods.md](methods.md) for every endpoint used and for the exact definitions of each figure.

## Rules this project keeps

- Read-only. No wallet connection, no signing, no spending.
- No analytics and no tracking. No personal data is collected or stored.
- No names are guessed: requester labels are the display names the Taskmarket API itself returns, and every wallet is shown truncated.
- Every number on the page comes from the public API and can be reproduced from it.
- The footer says this was built for a paid Taskmarket bounty and is not an official Taskmarket product.

## Brand

Type and colour follow the Taskmarket brand kit: Instrument Serif, Inter Tight and Departure Mono, on warm black, with magenta as the single accent. The Taskmarket lockup is used as supplied and is never redrawn.

## Licence

MIT. See [LICENSE](LICENSE).