# Autopilot

**Maximize your Aeroplan point redemptions on Air Canada.**

Autopilot is a free, open source Chrome extension that shows you the real value of your Aeroplan points on every Air Canada flight. Color-coded badges appear directly on search results, letting you instantly know whether to book with points or pay cash.

## What It Does

When you search for flights on [aircanada.com](https://www.aircanada.com) using Aeroplan points, Autopilot:

1. Automatically fetches the equivalent cash fare in a background tab
2. Calculates the cents-per-point (CPP) value for every flight and cabin class
3. Displays color-coded badges on each fare cell:
   - **Gold** — Best deal on the page
   - **Green** — Above-average value (pay with points)
   - **Red** — Below-average value (pay with cash)
4. Shows a detailed breakdown when you click any badge
5. Ranks your top 5 deals in the extension popup

## How It Works

**CPP = (Cash Price − Taxes & Fees) ÷ Points × 100**

For example, a flight costing $500 cash or 25,000 points + $56 in taxes:

CPP = ($500 − $56) ÷ 25,000 × 100 = **1.78 cents per point**

Aeroplan points are generally valued at **2.1 CPP (CAD)** based on [Prince of Travel's benchmark](https://princeoftravel.com/guides/aeroplan-points-valuation/). Anything at or above this is a good redemption.

## Privacy

Autopilot does **not** collect, store, or transmit any personal data:

- No accounts, no sign-ups
- No analytics or tracking
- No external servers — all processing happens in your browser
- No access to your Aeroplan credentials — the extension only reads fare prices already displayed on the page

See the full [privacy policy](./PRIVACY.md) for details.

## Installation

### From the Chrome Web Store (Recommended)

[Install from the Chrome Web Store →](https://chrome.google.com/webstore/detail/gnmpfminmaijfpdcegocbpkdolkndkpd)

### From Source (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/J4mirand/autopilot-point-value-calculator-extension-.git
   cd autopilot-extension
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the project folder
5. Visit [aircanada.com](https://www.aircanada.com) and search for flights with Aeroplan points

## Development

```bash
# Install dependencies (for testing)
npm install

# Run the test suite
npm test
```

## Project Structure

```
src/
  background/service_worker.js   Background fetch + message routing
  content/content_main.js        Orchestration pipeline
  content/scraper.js             DOM scraping
  content/overlay.js             Badge injection (Shadow DOM)
  content/tooltip.js             Detailed breakdown tooltip
  popup/                         Extension popup UI
  utils/algorithm.js             Pure calculation functions
  utils/constants.js             Selectors and config
tests/                           Jest test suites
```

## Roadmap

- [ ] Support additional airlines and loyalty programs (United, Delta, WestJet Rewards)
- [ ] Better handling of interline/mixed-carrier itineraries
- [ ] Price alerts when CPP exceeds a threshold
- [ ] Multi-currency support beyond CAD and USD
- [ ] Improved cash fare comparison (across airlines, not just AC)

## Contributing

Contributions are welcome! Whether it's bug fixes, new features, or documentation improvements:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and add tests
4. Run `npm test` to make sure everything passes
5. Submit a pull request

For larger changes, please open an issue first to discuss.

## Feedback

Found a bug or have a feature request? Please [open an issue](https://github.com/J4mirand/autopilot-point-value-calculator-extension-/issues) or submit feedback via the [extension's feedback form](https://forms.gle/qQu4h66TruVkmhrB9).

## License

MIT — see [LICENSE](./LICENSE) for details.

## Disclaimer

Autopilot is not affiliated with, endorsed by, or sponsored by Air Canada or Aeroplan. Use at your own discretion.
