# GG Silkscreen Tampermonkey Scripts

Teesom CRM add-ons for GG Silkscreen. Every script updates itself from this repo.

## Install (once per computer)
1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension in Chrome.
2. Click **Install** next to each script and confirm in the Tampermonkey tab.

| Script | Link |
|---|---|
| Header buttons (Shop Manual, Complete & Print, Send Jobs, Import Chipply) | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-header-buttons.user.js) |
| Job Board quick comments + "?" question emails | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-job-board-comments.user.js) |
| Calendar - show job description | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-calendar-description.user.js) |
| Copy buttons (design number + email) | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-copy-buttons.user.js) |
| Art window - paste image to upload | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-paste-image.user.js) |
| Create PO tools (invoice filter, SanMar / S&S buttons) | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-po-tools.user.js) |
| Ink color dropdown | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-ink-colors.user.js) |
| Cost lock indicator + true Unlock All | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-cost-lock.user.js) |
| Heat press transfer stock + Create New art | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-transfer-stock.user.js) |
| Print Traveler - auto-send customer link | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-send-link.user.js) |
| Traveler - show row comments by default | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-row-comments.user.js) |
| Traveler - invoice QR code | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-qr.user.js) |
| Traveler / WO - Print for ESP button | [Install](https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-print-for-esp.user.js) |

The Header buttons, Transfer stock and Traveler send-link scripts ask once for the GG API token. It is never stored in this repo.

## Pushing an update
1. Open the file in `scripts/`, click the pencil, make the change.
2. **Raise the `@version` number** in the header (e.g. 3.7.1 -> 3.7.2). Tampermonkey ignores changes without a higher version.
3. Commit. Computers pick it up at their next update check (about daily), or right away via Tampermonkey > Dashboard > "Check for userscript updates".

Never paste API tokens or passwords into these files - this repo is public.
