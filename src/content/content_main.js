/**
 * Autopilot Extension — Content Script Entry Point
 *
 * Orchestrates: detect page → scrape → analyse → inject badges → tooltips.
 *
 * All modules are loaded via the manifest content_scripts array
 * and share the window.Autopilot namespace.
 */
(function () {
  'use strict';

  // Skip execution in background fetch tabs (opened by service worker to scrape cash prices).
  // Without this guard, content scripts in fetch tabs trigger more fetches → infinite loop.
  if (window.location.search.indexOf('_autopilot_fetch=1') !== -1) {
    return;
  }

  var AP = window.Autopilot;
  if (!AP) {
    console.warn('[Autopilot] Namespace not found — constants/algorithm/scraper not loaded.');
    return;
  }

  // Prevent double-initialization for the same URL.
  // Manifest content_scripts inject on page load, AND onHistoryStateUpdated
  // re-injects 1.5s later for SPA navigation. Without this guard, both
  // instances race and open duplicate fetch tabs.
  var currentUrl = window.location.href;
  if (AP._initializedUrl === currentUrl) {
    console.log('[Autopilot] Already initialized for this URL, skipping.');
    return;
  }

  // If re-injected via SPA navigation (URL changed), clean up the previous instance
  if (AP._cleanup) {
    console.log('[Autopilot] Cleaning up previous instance for re-injection.');
    AP._cleanup();
  }

  AP._initializedUrl = currentUrl;

  // ---- Page detection ----

  function isFlightResultsPage() {
    var url = window.location.href.toLowerCase();
    for (var i = 0; i < AP.URL_PATTERNS.length; i++) {
      if (url.indexOf(AP.URL_PATTERNS[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  // ---- Pipeline (cash booking page) ----

  function runPipeline() {
    var cards = AP.findFlightCards();
    var results = AP.processFlightCards(cards);

    if (results.length > 0) {
      AP.assignPageRatings(results);
      AP.injectAllBadges(results);
      AP.storeFlightsForPopup(results);
    }
  }

  // ---- Aeroplan pipeline (points redemption page) ----
  // State stored on AP namespace so it survives across IIFE re-injections.

  var cachedCashPrices = AP._cachedCashPrices || null;
  var cachedAeroplanCells = AP._cachedAeroplanCells || null;
  var cashFetchInProgress = AP._cashFetchInProgress || false;
  var cachedRoute = AP._cachedRoute || null;
  var lastPipelineUrl = AP._lastPipelineUrl || null; // Track URL to detect date selector changes

  /**
   * Determine if we are on the inbound (return) leg of a round trip.
   */
  function isInboundPage() {
    return (window.location.pathname || '').indexOf('inbound') !== -1;
  }

  /**
   * Extract route from the page DOM (h2 header for airports and date).
   * Used as fallback when URL has no query params (e.g. date selector click strips them).
   * h2 format: "Toronto (YYZ) - Vancouver (YVR) | Tuesday December 15, 2026"
   */
  function extractRouteFromPage() {
    var org = '', dest = '', date = '';
    var monthNames = {
      'january': '01', 'february': '02', 'march': '03', 'april': '04',
      'may': '05', 'june': '06', 'july': '07', 'august': '08',
      'september': '09', 'october': '10', 'november': '11', 'december': '12'
    };
    var h2 = document.querySelector('h2');
    if (h2) {
      var text = h2.textContent;
      // Extract airport codes: "(YYZ)" and "(YVR)"
      var codes = text.match(/\(([A-Z]{3})\)/g);
      if (codes && codes.length >= 2) {
        org = codes[0].replace(/[()]/g, '');
        dest = codes[codes.length - 1].replace(/[()]/g, '');
      }
      // Extract date: "December 15, 2026" → "2026-12-15"
      var dateMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i);
      if (dateMatch) {
        var mm = monthNames[dateMatch[1].toLowerCase()];
        var dd = dateMatch[2].length === 1 ? '0' + dateMatch[2] : dateMatch[2];
        date = dateMatch[3] + '-' + mm + '-' + dd;
      }
    }
    console.log('[Autopilot] extractRouteFromPage:', org, '→', dest, 'on', date);
    return { org: org, dest: dest, date: date };
  }

  /**
   * Get the route for cash price fetching.
   * Tries URL params first, falls back to reading the page DOM.
   * On inbound: airports come from h2, date from fare cell class.
   * On outbound with date selector: URL params stripped → same DOM fallback.
   */
  function getCurrentRoute() {
    if (cachedRoute) return cachedRoute;

    var r = AP.extractRouteFromUrl();

    // If URL params are missing (date selector click strips them), fall back to DOM.
    // Also mark fillForm so the service worker programmatically fills the search form
    // (AC ignores URL params and uses session-cached values, which have the OLD date).
    var usedDomFallback = false;
    if (!r.org || !r.dest || !r.date) {
      var pageRoute = extractRouteFromPage();
      if (!r.org && pageRoute.org) { r.org = pageRoute.org; usedDomFallback = true; }
      if (!r.dest && pageRoute.dest) { r.dest = pageRoute.dest; usedDomFallback = true; }
      if (!r.date && pageRoute.date) { r.date = pageRoute.date; usedDomFallback = true; }
      console.log('[Autopilot] Route from DOM fallback:', r.org, '→', r.dest, 'on', r.date);
    }

    if (r.org && r.dest) {
      cachedRoute = { org: r.org, dest: r.dest, date: r.date, adults: r.adults || 1, fillForm: usedDomFallback };
    }
    return r;
  }

  function runAeroplanPipeline() {
    // Detect URL changes (e.g. date selector click) and invalidate stale cache.
    // When the user clicks a different date, AC pushes a new URL (often stripping
    // query params). The MutationObserver fires before re-injection, so we must
    // detect the URL change here and clear cached prices to avoid showing stale CPP.
    var currentPipelineUrl = window.location.href;
    if (lastPipelineUrl && lastPipelineUrl !== currentPipelineUrl) {
      console.log('[Autopilot] URL changed (date selector?), invalidating cache.');
      cachedCashPrices = null;
      cachedAeroplanCells = null;
      cashFetchInProgress = false;
      cachedRoute = null;
      AP._cachedCashPrices = null;
      AP._cachedAeroplanCells = null;
      AP._cashFetchInProgress = false;
      AP._cachedRoute = null;
      lastPipelineUrl = currentPipelineUrl;
      AP._lastPipelineUrl = currentPipelineUrl;
      // Mark this URL as handled so the onHistoryStateUpdated re-injection
      // (which fires 1500ms later) sees it and skips — preventing double fetch tabs.
      AP._initializedUrl = currentPipelineUrl;
      if (AP.resetProcessedCells) AP.resetProcessedCells();
    }
    lastPipelineUrl = currentPipelineUrl;
    AP._lastPipelineUrl = currentPipelineUrl;

    var freshCells = AP.scrapeAeroplanFareCells();
    if (freshCells.length > 0) {
      cachedAeroplanCells = (cachedAeroplanCells || []).concat(freshCells);
    }
    if (!cachedAeroplanCells || cachedAeroplanCells.length === 0) return;

    if (cachedCashPrices) {
      // Remove all calculating badges now that we have cash prices
      AP.removeAllCalculatingBadges(cachedAeroplanCells);
      // Match and inject CPP badges
      var results = AP.matchWithCashPrices(cachedAeroplanCells, cachedCashPrices);
      if (results.length > 0) {
        AP.assignPageRatings(results);
        AP.injectAllBadges(results);
        AP.storeFlightsForPopup(results);
      }
    } else if (isInboundPage()) {
      // On inbound page, check if return cash prices were pre-fetched
      AP.injectAllCalculatingBadges(cachedAeroplanCells);

      if (!cashFetchInProgress) {
        cashFetchInProgress = true;
        AP._cashFetchInProgress = true;
        // Try to load pre-fetched return prices from storage
        chrome.runtime.sendMessage({ action: 'getReturnCashPrices' }, function (response) {
          if (response && response.prices && response.prices.length > 0) {
            cachedCashPrices = response.prices;
            cashFetchInProgress = false;
            AP._cashFetchInProgress = false;
            console.log('[Autopilot] Using pre-fetched return cash prices:', cachedCashPrices.length, 'flights.');
            runAeroplanPipeline();
          } else {
            // Pre-fetch not ready yet or not available — fetch directly
            console.log('[Autopilot] No pre-fetched return prices. Fetching now...');
            var route = getCurrentRoute();
            route.fillForm = true;
            console.log('[Autopilot] Fetching return cash prices for', route.org, '→', route.dest, 'on', route.date);
            chrome.runtime.sendMessage(
              { action: 'fetchCashPrices', route: route },
              function (resp) {
                cashFetchInProgress = false;
                AP._cashFetchInProgress = false;
                if (resp && resp.ok && resp.prices && resp.prices.length > 0) {
                  cachedCashPrices = resp.prices;
                  console.log('[Autopilot] Got', cachedCashPrices.length, 'return cash flights.');
                  runAeroplanPipeline();
                } else {
                  console.warn('[Autopilot] No return cash prices returned.');
                }
              }
            );
          }
        });
      }
    } else {
      // Outbound page — fetch cash prices normally
      AP.injectAllCalculatingBadges(cachedAeroplanCells);

      if (!cashFetchInProgress) {
        cashFetchInProgress = true;
        AP._cashFetchInProgress = true;
        var route = getCurrentRoute();
        console.log('[Autopilot] Fetching outbound cash prices for', route.org, '→', route.dest, 'on', route.date, route.fillForm ? '(fillForm)' : '(URL params)');

        chrome.runtime.sendMessage(
          { action: 'fetchCashPrices', route: route },
          function (response) {
            cashFetchInProgress = false;
            AP._cashFetchInProgress = false;
            if (response && response.ok && response.prices && response.prices.length > 0) {
              cachedCashPrices = response.prices;
              console.log('[Autopilot] Got', cachedCashPrices.length, 'outbound cash flights.');
              runAeroplanPipeline();

              // If round trip, pre-fetch return cash prices in the background
              var fullRoute = AP.extractRouteFromUrl();
              if (fullRoute.tripType === 'R' && fullRoute.returnDate) {
                var returnRoute = {
                  org: fullRoute.dest,
                  dest: fullRoute.org,
                  date: fullRoute.returnDate,
                  adults: fullRoute.adults,
                  fillForm: true,
                };
                console.log('[Autopilot] Pre-fetching return cash prices for', returnRoute.org, '→', returnRoute.dest, 'on', returnRoute.date);
                chrome.runtime.sendMessage(
                  { action: 'fetchCashPrices', route: returnRoute, storeAsReturn: true }
                );
              }
            } else {
              console.warn('[Autopilot] No outbound cash prices returned.');
            }
          }
        );
      }
    }
  }

  // ---- Tooltip bridge ----
  // Badge info buttons dispatch 'autopilot-show-tooltip' (composed, crosses shadow DOM)

  function setupTooltipBridge() {
    document.addEventListener('autopilot-show-tooltip', function (e) {
      var analysis = e.detail;
      if (!analysis) return;
      AP.showTooltip(e.target, analysis);
    });
  }

  // ---- Capture-phase handler ----
  // Intercepts clicks on Autopilot badges BEFORE AC's Angular handlers fire,
  // preventing the fare expansion panel from opening when a badge is clicked.

  function setupCapturePhaseHandler() {
    document.addEventListener('click', function (e) {
      var el = e.target;
      // Walk up from click target to find if it's inside a badge host
      while (el && el !== document.body) {
        if (el.hasAttribute && el.hasAttribute('data-autopilot-badge')) {
          // Block AC's Angular from receiving this click
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();
          // Manually trigger tooltip (propagation into shadow DOM is blocked)
          var analysis = el.__autopilotAnalysis;
          if (analysis && AP.showTooltip) {
            AP.showTooltip(el, analysis);
          }
          return;
        }
        el = el.parentElement;
      }
      // Tooltip clicks are NOT intercepted — the tooltip is position:fixed
      // on document.body, so AC's fare-cell handlers won't fire.
    }, true); // capturing phase
  }

  // ---- Init ----

  function init() {
    if (!isFlightResultsPage()) return;

    // Block AC's Angular from intercepting badge/tooltip clicks
    setupCapturePhaseHandler();

    // Tooltip dismiss listeners (click-outside, ESC)
    AP.initTooltipListeners();

    // Connect badge info clicks to tooltips
    setupTooltipBridge();

    // Choose pipeline based on page type
    var isAeroplan = AP.isAeroplanPage && AP.isAeroplanPage();
    var activePipeline = isAeroplan ? runAeroplanPipeline : runPipeline;

    console.log('[Autopilot] Detected page type:', isAeroplan ? 'Aeroplan Redemption' : 'Cash Booking');

    // Clear previous flights for this tab (new search replaces old results)
    try {
      chrome.runtime.sendMessage({ action: 'clearFlights' });
    } catch (e) { /* non-critical */ }

    // Initial scrape pass
    activePipeline();

    // Watch for dynamically loaded flight cards
    var pipelineTimer = null;
    var observer = AP.createMutationObserver(function () {
      clearTimeout(pipelineTimer);
      pipelineTimer = setTimeout(activePipeline, 350);
    }, 300);

    // Register cleanup so re-injection (SPA navigation) can tear down this instance
    AP._cleanup = function () {
      observer.disconnect();
      clearTimeout(pipelineTimer);
      cachedCashPrices = null;
      cachedAeroplanCells = null;
      cashFetchInProgress = false;
      cachedRoute = null;
      // Sync to AP namespace
      AP._cachedCashPrices = null;
      AP._cachedAeroplanCells = null;
      AP._cashFetchInProgress = false;
      AP._cachedRoute = null;
      AP._lastPipelineUrl = null;
      AP._initializedUrl = null;
      if (AP.resetProcessedCells) AP.resetProcessedCells();
    };

    // Cleanup on unload
    window.addEventListener('beforeunload', function () {
      AP._cleanup();
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
