# Contributing to Autopilot

Thanks for your interest in contributing! This guide will help you get started.

## Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/J4mirand/autopilot-point-value-calculator-extension-.git
   cd autopilot-extension
   ```

2. Install dependencies (for testing):
   ```bash
   npm install
   ```

3. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the project folder

## Development Workflow

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes.

3. Run the test suite:
   ```bash
   npm test
   ```

4. Test the extension manually on [aircanada.com](https://www.aircanada.com) to verify your changes work as expected.

5. Commit and push:
   ```bash
   git commit -m "Add feature X"
   git push origin feature/my-feature
   ```

6. Open a pull request.

## What to Contribute

### Good first issues

- Fix bugs listed in the [Issues](https://github.com/J4mirand/autopilot-point-value-calculator-extension-/issues) tab
- Improve test coverage
- Documentation improvements

### Bigger features

Open an issue first to discuss. Some ideas from the roadmap:

- **New airlines and loyalty programs** — add support for United MileagePlus, Delta SkyMiles, WestJet Rewards, etc.
- **Interline itinerary handling** — better logic for mixed-carrier redemptions
- **Price alerts** — notify users when CPP exceeds a threshold
- **Multi-currency** — support beyond CAD and USD

## Code Style

- Vanilla JavaScript, no frameworks
- Use `var` for consistency with the existing codebase (the extension uses IIFE patterns)
- Follow the existing folder structure
- Add tests for pure functions in `tests/`

## Testing

All pure functions (e.g. in `src/utils/algorithm.js`) should have unit tests. Manual testing on aircanada.com is required for any DOM-interacting changes.

Run tests:
```bash
npm test
```

## Architecture Overview

```
Browser                     Extension
──────────────────────────────────────────────
aircanada.com (user tab)
  └─ content scripts      ← Scrape fare data
      └─ Shadow DOM       ← Inject CPP badges

Service worker            ← Background tab for cash price lookup
  └─ chrome.storage        ← Per-tab flight data

Extension popup           ← Top 5 deals ranked by CPP
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for more detail.

## Questions?

Open an issue or reach out through the [feedback form](https://forms.gle/qQu4h66TruVkmhrB9).
