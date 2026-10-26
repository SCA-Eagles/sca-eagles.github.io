# SCA Eagles Master Schedule

School-branded public athletics schedule for Scottsdale Christian Academy.

## Publishing and configuration

This repository is a **fresh import**: no commits or previous account history were transferred.
The action uses two GitHub repository secrets instead of storing workbook URLs in the source:

- `SCA_FACILITIES_URL` — the read-only Field & Gym Excel workbook share link.
- `SCA_TRANSPORTATION_URL` — the read-only Transportation Excel workbook share link.

Configure both at **Settings → Secrets and variables → Actions → New repository secret**.
The source links should not be pasted into commits or public issues.

With both secrets configured, run **Actions → Refresh SCA schedules → Run workflow**.
GitHub Pages should use **Settings → Pages → Source: GitHub Actions**.

The workflow publishes the site to the organization root: `https://sca-eagles.github.io/`.

## How the files fit together

- `dashboard/`: static website, published to the root of GitHub Pages.
- `scripts/refresh.mjs`: downloads the read-only source spreadsheets and generates site JSON.
- `data/`: latest successful copies of normalized schedule JSON; updated by Actions.
- `.github/workflows/refresh.yml`: updates the website approximately twice hourly.

Only athletics transportation rows from the current 2026–2027 sheet are included in the published transport JSON. Event names like field trips, teacher surnames, or grade-only labels are excluded. Middle school golf, swimming, cross-country, and spiritline are included.

## Operations

Do not retire the original site until the new site and its automatic refresh have been verified. Update any coach/parent shortcuts to the new website only after testing.
