/**
 * Autopilot Extension — Tooltip Component (Shadow DOM)
 *
 * Matches the high-fidelity designs:
 * - White card with rounded corners + shadow
 * - Illustration (wallet/airplane/stars) + verdict headline + savings amount
 * - BAD/GOOD slider gauge with benchmark marker
 * - "Powered by Autopilot" footer
 * - "Show breakdown" / "Hide breakdown" toggle
 * - Expanded breakdown: Point Value formula, Cash Value formula, Savings formula
 *
 * Three visual states:
 *   bad:  Red wallet illustration, "Fly with cash instead and save", red savings
 *   good: Green airplane illustration, "Fly with points and save", green savings
 *   max:  Gold stars illustration, "Best deal on this page. Fly with points and save", gold savings
 */
(function () {
  'use strict';

  var AP = (window.Autopilot = window.Autopilot || {});
  var TOOLTIP_HOST_ATTR = 'data-autopilot-tooltip';
  var activeHost = null;

  // -- Inline SVG illustrations --

  var ILLUSTRATION = {
    bad: '<svg viewBox="0 0 120 120" width="100" height="100" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="60" cy="60" r="52" fill="#D1FAE5" opacity="0.4"/>'
      + '<rect x="32" y="42" width="56" height="44" rx="6" fill="#DC2626"/>'
      + '<rect x="32" y="42" width="56" height="12" rx="3" fill="#991B1B"/>'
      + '<circle cx="46" cy="68" r="4" fill="#FCA5A5"/>'
      + '<rect x="38" y="62" width="16" height="12" rx="2" fill="#B91C1C"/>'
      + '<text x="44" y="72" font-size="12" fill="white" font-weight="bold">$</text>'
      + '<path d="M70 30 L85 18" stroke="#16A34A" stroke-width="2" fill="none"/>'
      + '<path d="M82 15 L88 22 L76 20Z" fill="#16A34A"/>'
      + '<path d="M55 28 L62 16" stroke="#16A34A" stroke-width="2" fill="none"/>'
      + '<path d="M58 12 L66 17 L56 18Z" fill="#16A34A"/>'
      + '</svg>',
    good: '<img src="data:image/png;base64,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" width="100" height="100" style="display:block" />',
    max: '<svg viewBox="0 0 120 120" width="100" height="100" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="60" cy="60" r="52" fill="#BFDBFE" opacity="0.4"/>'
      + '<g transform="translate(60,55)">'
      + '<polygon points="0,-28 7,-10 26,-10 11,2 17,22 0,12 -17,22 -11,2 -26,-10 -7,-10" fill="#F59E0B"/>'
      + '</g>'
      + '<g transform="translate(35,38) scale(0.5)">'
      + '<polygon points="0,-28 7,-10 26,-10 11,2 17,22 0,12 -17,22 -11,2 -26,-10 -7,-10" fill="#FBBF24"/>'
      + '</g>'
      + '<g transform="translate(85,42) scale(0.4)">'
      + '<polygon points="0,-28 7,-10 26,-10 11,2 17,22 0,12 -17,22 -11,2 -26,-10 -7,-10" fill="#FCD34D"/>'
      + '</g>'
      + '<g transform="translate(42,80) scale(0.3)">'
      + '<polygon points="0,-28 7,-10 26,-10 11,2 17,22 0,12 -17,22 -11,2 -26,-10 -7,-10" fill="#FDE68A"/>'
      + '</g>'
      + '<g transform="translate(80,75) scale(0.35)">'
      + '<polygon points="0,-28 7,-10 26,-10 11,2 17,22 0,12 -17,22 -11,2 -26,-10 -7,-10" fill="#FBBF24"/>'
      + '</g>'
      + '</svg>',
  };

  var SHADOW_CSS = '\
    * { box-sizing: border-box; margin: 0; padding: 0; }\
    @keyframes ap-slide-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }\
    :host { position:fixed; z-index:2147483647; animation:ap-slide-up 150ms ease; }\
    .tooltip {\
      width: 340px;\
      background: #FFFFFF;\
      border: 1px solid #E5E7EB;\
      border-radius: 16px;\
      box-shadow: 0 10px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);\
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\
      font-size: 14px;\
      color: #1F2937;\
      overflow: hidden;\
    }\
    .top {\
      padding: 24px 24px 16px;\
      display: flex;\
      align-items: flex-start;\
      gap: 12px;\
    }\
    .illustration { flex-shrink: 0; }\
    .headline { flex: 1; }\
    .headline-text {\
      font-size: 16px;\
      line-height: 1.4;\
      color: #374151;\
      margin-bottom: 4px;\
    }\
    .headline-text strong { color: #111827; }\
    .savings {\
      font-size: 36px;\
      font-weight: 800;\
      line-height: 1.1;\
      letter-spacing: -0.02em;\
    }\
    .savings--bad { color: #DC2626; }\
    .savings--good { color: #16A34A; }\
    .savings--max {\
      color: #92400E;\
      background: #FDE68A;\
      display: inline-block;\
      padding: 2px 8px;\
      border-radius: 6px;\
    }\
    .gauge-section {\
      padding: 0 24px 16px;\
    }\
    .gauge-labels {\
      position: relative;\
      height: 20px;\
      font-size: 12px;\
      font-weight: 600;\
      color: #6B7280;\
      margin-bottom: 6px;\
    }\
    .gauge-labels.staggered { height: 28px; }\
    .gauge-label {\
      position: absolute;\
      transform: translateX(-50%);\
      white-space: nowrap;\
      bottom: 0;\
    }\
    .gauge-labels.staggered .gauge-label.top-row {\
      bottom: auto;\
      top: 0;\
    }\
    .gauge-label.active { color: #111827; font-weight: 700; }\
    .gauge-track {\
      position: relative;\
      height: 8px;\
      background: #E5E7EB;\
      border-radius: 4px;\
      margin-bottom: 8px;\
    }\
    .gauge-fill {\
      position: absolute;\
      top: 0;\
      height: 100%;\
      border-radius: 4px;\
    }\
    .gauge-fill--bad { background: #FECACA; }\
    .gauge-fill--good { background: #BBF7D0; }\
    .gauge-fill--max { background: #FDE68A; }\
    .gauge-dot {\
      position: absolute;\
      top: 50%;\
      width: 14px; height: 14px;\
      border-radius: 50%;\
      border: 2px solid white;\
      transform: translate(-50%, -50%);\
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);\
    }\
    .gauge-dot--benchmark { background: #6B7280; }\
    .gauge-dot--flight-bad { background: #DC2626; }\
    .gauge-dot--flight-good { background: #16A34A; }\
    .gauge-dot--flight-max { background: #F59E0B; }\
    .gauge-markers {\
      position: relative;\
      min-height: 28px;\
    }\
    .marker {\
      position: absolute;\
      text-align: center;\
      transform: translateX(-50%);\
    }\
    .marker-line {\
      width: 1px;\
      height: 8px;\
      margin: 0 auto 4px;\
    }\
    .marker-line--dashed {\
      border-left: 1px dashed #9CA3AF;\
      height: 8px;\
    }\
    .marker-bubble {\
      display: inline-flex;\
      align-items: center;\
      gap: 3px;\
      padding: 3px 8px;\
      border-radius: 6px;\
      font-size: 12px;\
      font-weight: 600;\
      white-space: nowrap;\
    }\
    .marker-bubble--benchmark {\
      background: #F3F4F6;\
      color: #4B5563;\
      border: 1px solid #E5E7EB;\
    }\
    .marker-bubble--bad { background: #FEE2E2; color: #991B1B; }\
    .marker-bubble--good { background: #DCFCE7; color: #166534; }\
    .marker-bubble--max { background: #FEF3C7; color: #92400E; }\
    .bad-good-labels {\
      display: flex;\
      align-items: center;\
      gap: 2px;\
      font-size: 10px;\
      font-weight: 700;\
      letter-spacing: 0.05em;\
    }\
    .bad-label { color: #DC2626; }\
    .good-label { color: #16A34A; }\
    .arrow-left { color: #DC2626; font-size: 8px; }\
    .arrow-right { color: #16A34A; font-size: 8px; }\
    .info-icon {\
      display: inline-flex; align-items: center; justify-content: center;\
      width: 14px; height: 14px; border-radius: 50%; border: 1px solid #D1D5DB;\
      font-size: 9px; color: #9CA3AF; cursor: help;\
    }\
    .footer {\
      padding: 12px 24px;\
      text-align: center;\
      font-size: 12px;\
      color: #9CA3AF;\
    }\
    .breakdown-btn {\
      display: block;\
      width: 100%;\
      padding: 14px;\
      background: #2563EB;\
      color: white;\
      border: none;\
      font-size: 15px;\
      font-weight: 600;\
      cursor: pointer;\
      transition: background 120ms ease;\
      font-family: inherit;\
    }\
    .breakdown-btn:hover { background: #1D4ED8; }\
    .breakdown-btn--collapse {\
      background: white;\
      color: #2563EB;\
      border-top: 1px solid #E5E7EB;\
    }\
    .breakdown-btn--collapse:hover { background: #F9FAFB; }\
    .breakdown {\
      padding: 0 24px;\
      overflow: hidden;\
      max-height: 0;\
      transition: max-height 200ms ease, padding 200ms ease;\
    }\
    .breakdown.open {\
      max-height: 500px;\
      padding: 20px 24px;\
      border-top: 1px solid #E5E7EB;\
    }\
    .bd-section { margin-bottom: 14px; }\
    .bd-section:last-child { margin-bottom: 0; }\
    .bd-title {\
      font-size: 13px;\
      font-weight: 700;\
      color: #111827;\
      margin-bottom: 6px;\
    }\
    .bd-formula {\
      display: flex;\
      align-items: first baseline;\
      gap: 6px;\
      flex-wrap: nowrap;\
    }\
    .bd-big {\
      font-size: 15px;\
      font-weight: 700;\
      color: #111827;\
      white-space: nowrap;\
    }\
    .bd-op {\
      font-size: 14px;\
      color: #9CA3AF;\
      font-weight: 300;\
      flex-shrink: 0;\
      align-self: first baseline;\
    }\
    .bd-label {\
      font-size: 10px;\
      color: #9CA3AF;\
      display: block;\
      margin-top: 2px;\
      white-space: nowrap;\
    }\
    .bd-item {\
      text-align: left;\
      flex-shrink: 1;\
      min-width: 0;\
    }\
  ';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtNum(n) { return Number(n).toLocaleString('en-CA'); }

  function fmtPoints(pts) {
    if (pts >= 1000) return (pts / 1000).toFixed(pts % 1000 === 0 ? 0 : 1) + 'K';
    return String(pts);
  }

  /**
   * Create the tooltip matching the HiFi designs.
   */
  AP.createTooltipElement = function (analysis) {
    var a = analysis;
    var rating = a.rating || 'bad';
    var isMax = rating === 'max';
    var isGood = rating === 'good' || isMax;
    var isBad = rating === 'bad';

    // Headline text
    var headlineHtml;
    if (isMax) {
      headlineHtml = '<strong>Best deal</strong> on this page.<br>Fly with <strong>points</strong> and save';
    } else if (isGood) {
      headlineHtml = 'Fly with <strong>points</strong> and save';
    } else {
      headlineHtml = 'Fly with <strong>cash</strong> instead<br>and save';
    }

    // Savings display
    var savingsAmt = Math.abs(a.cashSavings || 0);
    var savingsClass = isMax ? 'savings--max' : (isGood ? 'savings--good' : 'savings--bad');

    // Gauge: fixed positions (dots don't scale or move based on CPP values)
    var benchmarkPct, flightPct;
    if (isBad) {
      flightPct = 22;
      benchmarkPct = 78;
    } else {
      benchmarkPct = 25;
      flightPct = 78;
    }
    var fillLeft = Math.min(benchmarkPct, flightPct);
    var fillWidth = Math.abs(flightPct - benchmarkPct);
    var fillClass = isMax ? 'gauge-fill--max' : (isGood ? 'gauge-fill--good' : 'gauge-fill--bad');
    var dotClass = isMax ? 'gauge-dot--flight-max' : (isGood ? 'gauge-dot--flight-good' : 'gauge-dot--flight-bad');
    var bubbleClass = isMax ? 'marker-bubble--max' : (isGood ? 'marker-bubble--good' : 'marker-bubble--bad');
    // BAD|GOOD label: directly below the Aeroplan points (benchmark) dot
    var badGoodPct = benchmarkPct;

    // Illustration — use actual PNGs via chrome.runtime.getURL for good/bad
    var illSvg;
    if (rating === 'good') {
      var planeUrl = chrome.runtime.getURL('icons/good-plane.png');
      illSvg = '<img src="' + planeUrl + '" width="100" height="100" style="display:block" />';
    } else if (rating === 'bad') {
      var badPlaneUrl = chrome.runtime.getURL('icons/bad-plane.png');
      illSvg = '<img src="' + badPlaneUrl + '" width="100" height="100" style="display:block" />';
    } else if (rating === 'max') {
      var bestStarUrl = chrome.runtime.getURL('icons/best-star.png');
      illSvg = '<img src="' + bestStarUrl + '" width="100" height="100" style="display:block" />';
    } else {
      illSvg = ILLUSTRATION[rating] || ILLUSTRATION.good;
    }

    // Breakdown formulas
    var estCashValue = a.estimatedCashValue || Math.round(((a.pointPrice * a.benchmarkCpp) / 100) * 100) / 100;

    var host = document.createElement('div');
    host.setAttribute(TOOLTIP_HOST_ATTR, '');
    var shadow = host.attachShadow({ mode: 'closed' });

    var styleEl = document.createElement('style');
    styleEl.textContent = SHADOW_CSS;
    shadow.appendChild(styleEl);

    var tooltip = document.createElement('div');
    tooltip.className = 'tooltip';

    tooltip.innerHTML =
      // Top section: illustration + headline + savings
      '<div class="top">' +
        '<div class="illustration">' + illSvg + '</div>' +
        '<div class="headline">' +
          '<div class="headline-text">' + headlineHtml + '</div>' +
          '<div class="savings ' + savingsClass + '">$' + fmtNum(savingsAmt) + '</div>' +
        '</div>' +
      '</div>' +

      // Gauge section
      '<div class="gauge-section">' +
        '<div class="gauge-labels staggered">' +
          '<span class="gauge-label" style="left:' + benchmarkPct + '%">Aeroplan points</span>' +
          '<span class="gauge-label top-row active" style="left:' + flightPct + '%">This flight</span>' +
        '</div>' +
        '<div class="gauge-track">' +
          '<div class="gauge-fill ' + fillClass + '" style="left:' + fillLeft + '%;width:' + fillWidth + '%"></div>' +
          '<div class="gauge-dot gauge-dot--benchmark" style="left:' + benchmarkPct + '%"></div>' +
          '<div class="gauge-dot ' + dotClass + '" style="left:' + flightPct + '%"></div>' +
        '</div>' +
        // Row 1: Flight CPP bubble + BAD|GOOD label
        '<div class="gauge-markers">' +
          '<div class="marker" style="left:' + flightPct + '%">' +
            '<div class="marker-bubble ' + bubbleClass + '">' +
              '<span>' + Number(a.cpp).toFixed(1) + '</span>' +
              '<span style="font-weight:400;font-size:10px">cents/point</span>' +
            '</div>' +
          '</div>' +
          '<div class="marker" style="left:' + badGoodPct + '%">' +
            '<div class="bad-good-labels">' +
              '<span class="arrow-left">\u25C0</span>' +
              '<span class="bad-label">BAD</span>' +
              '<span style="color:#D1D5DB">\u2502</span>' +
              '<span class="good-label">GOOD</span>' +
              '<span class="arrow-right">\u25B6</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Row 2: Benchmark bubble
        '<div class="gauge-markers">' +
          '<div class="marker" style="left:' + benchmarkPct + '%">' +
            '<div class="marker-bubble marker-bubble--benchmark">' +
              '<span>' + a.benchmarkCpp + '</span>' +
              '<span style="font-weight:400;font-size:10px">avg. cents/point</span>' +
              '<span class="info-icon">\u24D8</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Footer
      '<div class="footer">Powered by Autopilot <span class="info-icon">\u24D8</span></div>' +

      // Breakdown (hidden by default)
      '<div class="breakdown" id="bd">' +
        '<div class="bd-section">' +
          '<div class="bd-title">This Flight\'s Point Value</div>' +
          '<div class="bd-formula">' +
            '<span class="bd-op">(</span>' +
            '<div class="bd-item"><span class="bd-big">$' + fmtNum(a.cashPrice) + '</span><span class="bd-label">Cash Price<br>(' + esc(a.currency) + ')</span></div>' +
            '<span class="bd-op">\u2212</span>' +
            '<div class="bd-item"><span class="bd-big">$' + fmtNum(a.extraFees || 0) + '</span><span class="bd-label">Taxes &amp;<br>Fees</span></div>' +
            '<span class="bd-op">)</span>' +
            '<span class="bd-op">\u00F7</span>' +
            '<div class="bd-item"><span class="bd-big">' + fmtNum(a.pointPrice) + '</span><span class="bd-label">Point Price</span></div>' +
            '<span class="bd-op">=</span>' +
            '<div class="bd-item"><span class="bd-big">' + Number(a.cpp).toFixed(1) + '</span><span class="bd-label">cents/point</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="bd-section">' +
          '<div class="bd-title">This Flight\'s Cash Value</div>' +
          '<div class="bd-formula">' +
            '<div class="bd-item"><span class="bd-big">' + fmtNum(a.pointPrice) + '</span><span class="bd-label">Point Price</span></div>' +
            '<span class="bd-op">\u00D7</span>' +
            '<div class="bd-item"><span class="bd-big">' + a.benchmarkCpp + '</span><span class="bd-label">cents/point</span></div>' +
            '<span class="bd-op">=</span>' +
            '<div class="bd-item"><span class="bd-big">$' + fmtNum(estCashValue) + '</span><span class="bd-label">est. cash value of points</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="bd-section">' +
          '<div class="bd-title">How Much You Save</div>' +
          '<div class="bd-formula">' +
            '<div class="bd-item"><span class="bd-big">$' + fmtNum(a.cashPrice) + '</span><span class="bd-label">Cash Price<br>(' + esc(a.currency) + ')</span></div>' +
            '<span class="bd-op">\u2212</span>' +
            '<span class="bd-op">(</span>' +
            '<div class="bd-item"><span class="bd-big">$' + fmtNum(estCashValue) + '</span><span class="bd-label">est. cash<br>value</span></div>' +
            '<span class="bd-op">+</span>' +
            '<div class="bd-item"><span class="bd-big">$' + fmtNum(a.extraFees) + '</span><span class="bd-label">fees</span></div>' +
            '<span class="bd-op">)</span>' +
            '<span class="bd-op">=</span>' +
            '<div class="bd-item"><span class="bd-big">$' + fmtNum(savingsAmt) + '</span><span class="bd-label">in savings</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Toggle button
      '<button class="breakdown-btn" id="bd-btn">Show breakdown</button>';

    shadow.appendChild(tooltip);

    // Wire up the breakdown toggle
    var btn = shadow.getElementById('bd-btn');
    var bd = shadow.getElementById('bd');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = bd.classList.contains('open');
      if (isOpen) {
        bd.classList.remove('open');
        btn.textContent = 'Show breakdown';
        btn.className = 'breakdown-btn';
      } else {
        bd.classList.add('open');
        btn.textContent = 'Hide breakdown';
        btn.className = 'breakdown-btn breakdown-btn--collapse';
      }
    });

    return host;
  };

  var dismissTimer = null;
  var activeTrigger = null;
  var pinned = false; // true when user clicked to pin the tooltip open

  AP.showTooltip = function (triggerElement, analysis) {
    // If same trigger, don't recreate
    if (activeHost && activeTrigger === triggerElement) return;

    AP.hideTooltip();
    pinned = false;
    var host = AP.createTooltipElement(analysis);
    document.body.appendChild(host);
    activeHost = host;
    activeTrigger = triggerElement;

    // Auto-dismiss: hide tooltip when mouse leaves both badge and tooltip
    host.addEventListener('mouseenter', function () {
      clearTimeout(dismissTimer);
    });
    host.addEventListener('mouseleave', function () {
      if (!pinned) {
        dismissTimer = setTimeout(function () { AP.hideTooltip(); }, 300);
      }
    });

    // Pin tooltip when user clicks inside it (e.g. breakdown button)
    host.addEventListener('click', function () {
      pinned = true;
      clearTimeout(dismissTimer);
    });

    requestAnimationFrame(function () {
      var rect = triggerElement.getBoundingClientRect();
      var top = rect.bottom + 8;
      var left = rect.left;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      if (left + 340 > vw - 16) left = vw - 356;
      if (left < 16) left = 16;
      if (top + 420 > vh - 16) {
        top = rect.top - 428;
        if (top < 16) top = 16;
      }
      host.style.cssText = 'position:fixed !important; top:' + top + 'px !important; left:' + left + 'px !important; z-index:2147483647 !important; transform:none !important; will-change:auto !important;';
    });
  };

  AP.hideTooltip = function () {
    clearTimeout(dismissTimer);
    if (activeHost) { activeHost.remove(); activeHost = null; }
    activeTrigger = null;
    pinned = false;
  };

  /**
   * Schedule tooltip dismissal (called when mouse leaves badge).
   * Cancelled if mouse enters the tooltip within 300ms.
   */
  AP.scheduleHideTooltip = function () {
    if (pinned) return;
    clearTimeout(dismissTimer);
    dismissTimer = setTimeout(function () { AP.hideTooltip(); }, 300);
  };

  AP.initTooltipListeners = function () {
    document.addEventListener('click', function (e) {
      if (activeHost && !activeHost.contains(e.target)) AP.hideTooltip();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') AP.hideTooltip();
    });
  };
})();
