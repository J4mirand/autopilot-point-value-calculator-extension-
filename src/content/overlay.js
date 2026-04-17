/**
 * Autopilot Extension — Badge Injection (Shadow DOM)
 *
 * Matches the high-fidelity designs:
 * - Small pastel pill: [icon] X.X CPP
 * - Bad:  pink bg, down arrow icon
 * - Good: green bg, up arrow icon
 * - Max:  gold bg, star icon
 * - Positioned at bottom of each fare price cell
 */
(function () {
  'use strict';

  var AP = (window.Autopilot = window.Autopilot || {});

  var BADGE_HOST_ATTR = 'data-autopilot-badge';

  // Badge design tokens matching HiFi designs
  // Icons are inline SVGs for precise rendering across platforms
  var BADGE_ICONS = {
    bad: '<svg width="14" height="14" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="10" cy="10" r="10" fill="#991B1B"/>'
      + '<path d="M10 5v7M7 10l3 3 3-3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
      + '</svg>',
    good: '<svg width="14" height="14" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="10" cy="10" r="10" fill="#166534"/>'
      + '<path d="M10 15V8M7 10l3-3 3 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
      + '</svg>',
    max: '<svg width="14" height="14" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="10" cy="10" r="10" fill="#92400E"/>'
      + '<polygon points="10,3.5 12,8 17,8.5 13.5,12 14.5,17 10,14.5 5.5,17 6.5,12 3,8.5 8,8" fill="white"/>'
      + '</svg>',
    calculating: '',
  };

  var BADGE_STYLES = {
    bad: {
      bg: '#FECACA',
      border: '#FECACA',
      text: '#991B1B',
    },
    good: {
      bg: '#BBF7D0',
      border: '#BBF7D0',
      text: '#166534',
    },
    max: {
      bg: '#FDE68A',
      border: '#FDE68A',
      text: '#92400E',
    },
    calculating: {
      bg: 'linear-gradient(to right, rgba(139,92,246,0.1), rgba(168,85,247,0.1), rgba(217,70,239,0.1))',
      border: 'rgba(139,92,246,0.2)',
      text: '#7C3AED',
    },
  };

  var SHADOW_CSS = '\
    * { box-sizing: border-box; margin: 0; padding: 0; }\
    @keyframes autopilot-fade-in { from { opacity: 0; } to { opacity: 1; } }\
    @keyframes autopilot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }\
    @keyframes autopilot-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }\
    @keyframes autopilot-spin-slow { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }\
    @keyframes autopilot-glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }\
    @keyframes autopilot-bounce1 { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-3px); } }\
    @keyframes autopilot-bounce2 { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-3px); } }\
    @keyframes autopilot-bounce3 { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-3px); } }\
    :host {\
      display: inline-flex;\
      animation: autopilot-fade-in 150ms ease;\
      cursor: pointer;\
      vertical-align: middle;\
    }\
    .badge {\
      display: inline-flex;\
      align-items: center;\
      gap: 4px;\
      background: var(--ap-bg);\
      border: 1px solid var(--ap-border);\
      border-radius: 6px;\
      padding: 3px 8px;\
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\
      font-size: 12px;\
      line-height: 1.3;\
      color: var(--ap-text);\
      font-weight: 600;\
      white-space: nowrap;\
      transition: box-shadow 120ms ease, transform 80ms ease;\
    }\
    .badge:hover {\
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);\
      transform: translateY(-1px);\
    }\
    .badge.calculating {\
      position: relative;\
      overflow: hidden;\
      border-radius: 6px;\
      padding: 2px 6px;\
      font-size: 11px;\
      animation: autopilot-pulse 2s ease-in-out infinite;\
      cursor: default;\
      box-shadow: 0 0 15px rgba(139,92,246,0.15);\
    }\
    .badge.calculating:hover {\
      box-shadow: 0 0 15px rgba(139,92,246,0.15);\
      transform: none;\
    }\
    .badge.calculating .shimmer {\
      position: absolute;\
      inset: 0;\
      overflow: hidden;\
      border-radius: 6px;\
      pointer-events: none;\
    }\
    .badge.calculating .shimmer::after {\
      content: "";\
      position: absolute;\
      inset: 0;\
      background: linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent);\
      animation: autopilot-shimmer 2s ease-in-out infinite;\
    }\
    .badge.calculating .glow {\
      position: absolute;\
      inset: 0;\
      z-index: -1;\
      border-radius: 6px;\
      background: linear-gradient(to right, rgba(139,92,246,0.2), rgba(168,85,247,0.2), rgba(217,70,239,0.2));\
      filter: blur(6px);\
      animation: autopilot-glow 2s ease-in-out infinite;\
      pointer-events: none;\
    }\
    .badge.calculating .sparkle-icon {\
      animation: autopilot-spin-slow 4s linear infinite;\
    }\
    .badge.calculating .dots {\
      display: inline-flex;\
      gap: 2px;\
      align-items: center;\
      margin-left: 1px;\
    }\
    .badge.calculating .dot {\
      width: 3px;\
      height: 3px;\
      border-radius: 50%;\
      background: currentColor;\
      opacity: 0.8;\
    }\
    .badge.calculating .dot:nth-child(1) { animation: autopilot-bounce1 1.4s ease-in-out infinite; }\
    .badge.calculating .dot:nth-child(2) { animation: autopilot-bounce2 1.4s ease-in-out 0.2s infinite; }\
    .badge.calculating .dot:nth-child(3) { animation: autopilot-bounce3 1.4s ease-in-out 0.4s infinite; }\
    .badge.max {\
      position: relative;\
      overflow: hidden;\
      box-shadow: 0 0 12px rgba(245,158,11,0.2);\
    }\
    .badge.max .shimmer {\
      position: absolute;\
      inset: 0;\
      overflow: hidden;\
      border-radius: 6px;\
      pointer-events: none;\
    }\
    .badge.max .shimmer::after {\
      content: "";\
      position: absolute;\
      inset: 0;\
      background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);\
      animation: autopilot-shimmer 2.5s ease-in-out infinite;\
    }\
    .badge.max .glow {\
      position: absolute;\
      inset: 0;\
      z-index: -1;\
      border-radius: 6px;\
      background: linear-gradient(to right, rgba(245,158,11,0.25), rgba(251,191,36,0.25), rgba(245,158,11,0.25));\
      filter: blur(6px);\
      animation: autopilot-glow 2.5s ease-in-out infinite;\
      pointer-events: none;\
    }\
    .icon {\
      display: inline-flex;\
      align-items: center;\
      justify-content: center;\
      width: 14px;\
      height: 14px;\
      flex-shrink: 0;\
    }\
    .icon svg {\
      display: block;\
    }\
    .cpp-label {\
      font-size: 10px;\
      font-weight: 700;\
      text-transform: uppercase;\
      letter-spacing: 0.05em;\
      opacity: 0.8;\
    }\
  ';

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  /**
   * Create a badge element matching the HiFi design.
   * Small pastel pill: [icon] X.X CPP
   */
  AP.createBadgeElement = function (analysis) {
    var host = document.createElement('div');
    host.style.width = 'fit-content';
    host.setAttribute(BADGE_HOST_ATTR, '');
    var shadow = host.attachShadow({ mode: 'closed' });

    var rating = analysis.rating || 'bad';
    var style = BADGE_STYLES[rating] || BADGE_STYLES.bad;
    var cppDisplay = Number(analysis.cpp).toFixed(1);

    var styleEl = document.createElement('style');
    styleEl.textContent = SHADOW_CSS;
    shadow.appendChild(styleEl);

    var badge = document.createElement('span');
    badge.className = 'badge' + (rating === 'max' ? ' max' : '');
    badge.style.setProperty('--ap-bg', style.bg);
    badge.style.setProperty('--ap-border', style.border);
    badge.style.setProperty('--ap-text', style.text);
    badge.setAttribute('title', 'Click for details — ' + analysis.ratingLabel);

    var iconSvg = BADGE_ICONS[rating] || BADGE_ICONS.bad;
    var extraHtml = rating === 'max' ? '<div class="glow"></div><div class="shimmer"></div>' : '';
    badge.innerHTML =
      extraHtml +
      '<span class="icon">' + iconSvg + '</span>' +
      '<span class="value">' + escapeHtml(cppDisplay) + '</span>' +
      '<span class="cpp-label">CPP</span>';

    shadow.appendChild(badge);

    // Store analysis for tooltip
    host.__autopilotAnalysis = analysis;

    // Show tooltip on hover
    var hoverTimer = null;
    badge.addEventListener('mouseenter', function () {
      hoverTimer = setTimeout(function () {
        host.dispatchEvent(new CustomEvent('autopilot-show-tooltip', {
          bubbles: true,
          composed: true,
          detail: analysis,
        }));
      }, 150);
    });
    badge.addEventListener('mouseleave', function () {
      clearTimeout(hoverTimer);
      if (AP.scheduleHideTooltip) AP.scheduleHideTooltip();
    });

    // Also support click (keeps tooltip open for breakdown)
    badge.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      host.dispatchEvent(new CustomEvent('autopilot-show-tooltip', {
        bubbles: true,
        composed: true,
        detail: analysis,
      }));
    });

    return host;
  };

  /**
   * Create a "Calculating" placeholder badge shown while cash prices load.
   */
  AP.createCalculatingBadgeElement = function () {
    var host = document.createElement('div');
    host.style.width = 'fit-content';
    host.setAttribute(BADGE_HOST_ATTR, 'calculating');
    var shadow = host.attachShadow({ mode: 'closed' });

    var style = BADGE_STYLES.calculating;

    var styleEl = document.createElement('style');
    styleEl.textContent = SHADOW_CSS;
    shadow.appendChild(styleEl);

    var badge = document.createElement('span');
    badge.className = 'badge calculating';
    badge.style.setProperty('--ap-bg', 'transparent');
    badge.style.setProperty('--ap-border', style.border);
    badge.style.setProperty('--ap-text', style.text);
    badge.style.background = style.bg;
    badge.style.borderColor = style.border;

    badge.innerHTML =
      '<div class="glow"></div>' +
      '<div class="shimmer"></div>' +
      '<span class="value">Calculating</span>' +
      '<span class="dots">' +
        '<span class="dot"></span>' +
        '<span class="dot"></span>' +
        '<span class="dot"></span>' +
      '</span>';

    shadow.appendChild(badge);
    return host;
  };

  /**
   * Inject a badge into a fare cell element.
   * Skips re-injection if an identical CPP badge already exists (prevents pulsing).
   */
  AP.injectBadge = function (fareCellElement, analysis) {
    // Check if a badge with the same CPP already exists — don't re-inject
    var existing = fareCellElement.querySelector('[' + BADGE_HOST_ATTR + ']');
    if (existing) {
      var existingCpp = existing.getAttribute(BADGE_HOST_ATTR);
      var newCpp = String(Number(analysis.cpp).toFixed(1));
      if (existingCpp === newCpp) return; // same badge, skip
    }

    AP.removeBadge(fareCellElement);
    var badge = AP.createBadgeElement(analysis);
    badge.setAttribute(BADGE_HOST_ATTR, String(Number(analysis.cpp).toFixed(1)));

    badge.style.marginTop = '6px';
    badge.style.marginLeft = '6px';
    badge.style.marginBottom = '2px';
    fareCellElement.appendChild(badge);
  };

  /**
   * Inject a "Calculating" badge into a fare cell.
   * Skips if any badge (calculating or CPP) already exists.
   */
  AP.injectCalculatingBadge = function (fareCellElement) {
    var existing = fareCellElement.querySelector('[' + BADGE_HOST_ATTR + ']');
    if (existing) return; // already has a badge

    var badge = AP.createCalculatingBadgeElement();
    badge.style.marginTop = '6px';
    badge.style.marginLeft = '6px';
    badge.style.marginBottom = '2px';
    fareCellElement.appendChild(badge);
  };

  AP.removeBadge = function (element) {
    var all = element.querySelectorAll('[' + BADGE_HOST_ATTR + ']');
    all.forEach(function (el) { el.remove(); });
  };

  AP.injectAllBadges = function (results) {
    for (var i = 0; i < results.length; i++) {
      var target = results[i].fareCellElement || results[i].cardElement;
      AP.injectBadge(target, results[i].analysis);
    }
  };

  AP.injectAllCalculatingBadges = function (fareCells) {
    for (var i = 0; i < fareCells.length; i++) {
      var target = fareCells[i].element || fareCells[i].fareCellElement;
      if (target) AP.injectCalculatingBadge(target);
    }
  };

  AP.removeAllCalculatingBadges = function (fareCells) {
    for (var i = 0; i < fareCells.length; i++) {
      var target = fareCells[i].element || fareCells[i].fareCellElement;
      if (!target) continue;
      var badge = target.querySelector('[' + BADGE_HOST_ATTR + '="calculating"]');
      if (badge) badge.remove();
    }
  };
})();
