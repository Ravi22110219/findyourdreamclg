# BidsukRV | FindYourDreamCLg

Standalone JoSAA opening/closing-rank finder. It lives outside the existing dashboard code and can be opened directly in a browser.

## Use

1. Open `index.html`.
2. Select the JoSAA year and round.
3. Enter or paste a rank with category, for example `16500 OBC-NCL Female`.
4. Filter by quota, institute type, college, or branch.
5. Use the suggestion badge to separate Safe, Moderate, and Dream options.

The included app can switch between any generated JoSAA year/round datasets.

## Refresh Data

```bash
cd josaa-rank-finder
python3 scripts/fetch_josaa.py --year 2025 --round 6
```

The script writes:

- `data/josaa-2025-round-6.json`
- `data/josaa-2025-round-6.js`
- `data/datasets.js`

`index.html` loads `data/datasets.js` and then loads the selected year/round
`.js` data file, so it can work from `file://` without a web server.

## GitHub Pages

This folder is ready to become a separate GitHub repo. After pushing it to the
new repo's `main` branch, enable GitHub Pages with source set to GitHub Actions
in repository settings. The included `.github/workflows/deploy.yml` workflow
publishes the static site.

## Notes

- Source: <https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx>
- Developed by Bidsuk.tech.
- OPEN rows use CRL ranks.
- EWS, OBC-NCL, SC, and ST rows use category ranks.
- PwD rows use PwD ranks within the respective categories.
- This is a previous-year cutoff finder, not an admission guarantee.
