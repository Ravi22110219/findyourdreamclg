# JoSAA Rank Finder

Standalone JoSAA opening/closing-rank finder. It lives outside the existing dashboard code and can be opened directly in a browser.

## Use

1. Open `index.html`.
2. Enter or paste a rank with category, for example `16500 OBC-NCL Female`.
3. Filter by quota, institute type, college, or branch.

The included app uses JoSAA 2025 Round 6 data after running the fetcher below.

## Refresh Data

```bash
cd josaa-rank-finder
python3 scripts/fetch_josaa.py --year 2025 --round 6
```

The script writes:

- `data/josaa-2025-round-6.json`
- `data/josaa-2025-round-6.js`

`index.html` loads the `.js` file so it can work from `file://` without a web server.

## GitHub Pages

This folder is ready to become a separate GitHub repo. After pushing it to the
new repo's `main` branch, enable GitHub Pages with source set to GitHub Actions
in repository settings. The included `.github/workflows/deploy.yml` workflow
publishes the static site.

## Notes

- Source: <https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx>
- OPEN rows use CRL ranks.
- EWS, OBC-NCL, SC, and ST rows use category ranks.
- PwD rows use PwD ranks within the respective categories.
- This is a previous-year cutoff finder, not an admission guarantee.
