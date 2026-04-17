/**
 * Autopilot Extension — DOM Scraping Module
 *
 * Observes Air Canada flight result pages, extracts pricing data from
 * individual fare cells within each flight row, and feeds it into
 * the analysis pipeline.
 *
 * Handles two DOM structures:
 *   1. Real aircanada.com (Angular): .avail-flight-block-row-wrapper
 *      with .cabin-container fare cells and .cabin-price prices
 *   2. Test page: [data-testid="flight-card"] with .fare-cell elements
 *
 * Shared via window.Autopilot namespace.
 */
(function () {
  'use strict';

  var AP = (window.Autopilot = window.Autopilot || {});
  var SELECTORS = AP.SELECTORS;

  /** @type {WeakSet<Element>} Fare cells already processed. */
  var processedCells = new WeakSet();

  /** Reset processed cells tracker (used when route/date changes in SPA). */
  AP.resetProcessedCells = function () {
    processedCells = new WeakSet();
  };

  /** Debounce timer id. */
  var debounceTimer = null;

  // ---- Selector helpers ----

  AP.trySelectors = function (element, selectorArray) {
    if (!element || !Array.isArray(selectorArray)) return null;
    for (var i = 0; i < selectorArray.length; i++) {
      try {
        var match = element.querySelector(selectorArray[i]);
        if (match) return match;
      } catch (e) { /* skip invalid */ }
    }
    return null;
  };

  AP.trySelectorsAll = function (element, selectorArray) {
    if (!element || !Array.isArray(selectorArray)) return [];
    for (var i = 0; i < selectorArray.length; i++) {
      try {
        var matches = element.querySelectorAll(selectorArray[i]);
        if (matches.length > 0) return Array.from(matches);
      } catch (e) { /* skip invalid */ }
    }
    return [];
  };

  AP.extractTextContent = function (element, selectorArray) {
    var match = AP.trySelectors(element, selectorArray);
    if (!match) return null;
    var text = (match.textContent || '').trim();
    return text.length > 0 ? text : null;
  };

  // ---- AC-specific extraction helpers ----

  /**
   * Extract cabin class from an AC fare cell by inspecting button class names.
   * AC uses pattern: cabin-fare-{index}-{cabinCode} (Y=Economy, O=PremEcon, J=Biz)
   */
  function extractCabinClassFromAC(fareCell) {
    var button = fareCell.querySelector('[class*="button-cell-container"]');
    if (!button) return null;
    var cls = button.className || '';
    var match = cls.match(/cabin-fare-\d+-([A-Z])/);
    if (match && AP.CABIN_CODES) {
      return AP.CABIN_CODES[match[1]] || null;
    }
    // Also try aria-label
    var ariaLabel = button.getAttribute('aria-label') || '';
    var cabinMatch = ariaLabel.match(/Select (\w[\w\s]*?) seats/);
    if (cabinMatch) return cabinMatch[1];
    return null;
  }

  /**
   * Extract visible price from an AC cabin-price element.
   * AC has: <span class="cabin-price">
   *           <span class="visually-hidden">450CAD</span>
   *           <span aria-hidden="true">$450</span>
   *         </span>
   */
  function extractACPrice(fareCell) {
    var priceEl = fareCell.querySelector('.cabin-price [aria-hidden="true"]');
    if (priceEl) return priceEl.textContent.trim();
    var cabinPrice = fareCell.querySelector('.cabin-price');
    if (cabinPrice) {
      // Get the visible text (not the visually-hidden one)
      var visible = cabinPrice.querySelector('[aria-hidden="true"]');
      if (visible) return visible.textContent.trim();
      return cabinPrice.textContent.trim();
    }
    return null;
  }

  /**
   * Extract screen-reader price from AC (e.g., "450CAD" or "37000 points").
   * This contains both the numeric value and currency/type info.
   */
  function extractACScreenReaderPrice(fareCell) {
    var srEl = fareCell.querySelector('.cabin-price .visually-hidden');
    if (srEl) return srEl.textContent.trim();
    return null;
  }

  /**
   * Extract price from AC aria-label on button.
   * Pattern: "Select Economy seats starting from 450 $, 5 fares available"
   * Points pattern: "Select Economy seats starting from 37,000 points"
   */
  function extractPriceFromAriaLabel(fareCell) {
    var button = fareCell.querySelector('[class*="button-cell-container"]');
    if (!button) return null;
    var ariaLabel = button.getAttribute('aria-label') || '';

    // Cash: "starting from 450 $"
    var cashMatch = ariaLabel.match(/starting from ([\d,]+)\s*\$/);
    if (cashMatch) return { type: 'cash', value: '$' + cashMatch[1] };

    // Points: "starting from 37,000 points"
    var pointsMatch = ariaLabel.match(/starting from ([\d,]+)\s*points/i);
    if (pointsMatch) return { type: 'points', value: pointsMatch[1].replace(/,/g, '') };

    return null;
  }

  /**
   * Detect if we're in Aeroplan points mode vs cash mode.
   * In points mode, prices show as points instead of dollars.
   */
  function isPointsMode() {
    // Check if any price lacks a $ sign (indicating points mode)
    var prices = document.querySelectorAll('.cabin-price [aria-hidden="true"]');
    for (var i = 0; i < Math.min(prices.length, 5); i++) {
      var text = prices[i].textContent.trim();
      if (text && !text.includes('$') && /[\d,]+/.test(text)) return true;
    }
    // Also check aria-labels for "points"
    var buttons = document.querySelectorAll('[class*="button-cell-container"]');
    for (var j = 0; j < Math.min(buttons.length, 5); j++) {
      var label = buttons[j].getAttribute('aria-label') || '';
      if (label.indexOf('points') !== -1) return true;
    }
    return false;
  }

  /**
   * Check if a fare cell represents an available cabin.
   * AC marks available ones with class "availableCabin".
   */
  function isFareCellAvailable(fareCell) {
    var container = fareCell.querySelector('.cabin-fare-container');
    if (container) {
      return container.classList.contains('availableCabin');
    }
    // For test page, always available
    return true;
  }

  // ---- Heuristic detection ----

  function looksLikePoints(text) {
    if (!text) return false;
    return /^\d[\d,]*\.?\d*\s*[kK]?$/.test(text.trim());
  }

  function looksLikeFees(text) {
    if (!text) return false;
    return /^\+\s*(?:CA\s*\$|US\s*\$|\$)\s*[\d,]+/i.test(text.trim());
  }

  function heuristicFindFareCells(cardElement) {
    var candidates = [];
    var allElements = cardElement.querySelectorAll('div, td, li, section');
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      if (el === cardElement || el.children.length > 15) continue;
      var hasPoints = false;
      var hasFees = false;
      var children = el.querySelectorAll('*');
      for (var j = 0; j < children.length; j++) {
        var t = (children[j].textContent || '').trim();
        if (looksLikePoints(t) && t.match(/[kK]$/)) hasPoints = true;
        if (looksLikeFees(t)) hasFees = true;
      }
      if (hasPoints && hasFees) {
        var isParent = false;
        for (var c = 0; c < candidates.length; c++) {
          if (el.contains(candidates[c])) { isParent = true; break; }
        }
        if (!isParent) {
          candidates = candidates.filter(function (cand) { return !cand.contains(el); });
          candidates.push(el);
        }
      }
    }
    return candidates;
  }

  // ---- Fare cell data extraction ----

  /**
   * Extract flight data from a fare cell.
   * Handles both real AC DOM and test page DOM.
   */
  AP.extractFareCellData = function (fareCell, cardElement) {
    if (!fareCell) return null;

    var pointPriceRaw = null;
    var cashPriceRaw = null;
    var extraFeesRaw = null;
    var seatClass = null;
    var isACDom = false;

    // Strategy 1: Real AC DOM detection
    var acPrice = extractACPrice(fareCell);
    if (acPrice) {
      isACDom = true;
      var srPrice = extractACScreenReaderPrice(fareCell);
      var ariaInfo = extractPriceFromAriaLabel(fareCell);

      // Determine if this is points or cash
      if (ariaInfo && ariaInfo.type === 'points') {
        // Points mode
        pointPriceRaw = acPrice;
        // In points mode, we need the cash price — try getting it from the
        // screen reader text or the aria-label
        if (srPrice && srPrice.match(/\d+\s*CAD/)) {
          cashPriceRaw = srPrice;
        }
      } else {
        // Cash mode — this IS the cash price
        cashPriceRaw = acPrice;
        // In cash mode, we can't calculate CPP without points
        // Try to get points from aria-label
        if (ariaInfo && ariaInfo.type === 'cash') {
          cashPriceRaw = ariaInfo.value;
        }
      }

      // Get cabin class from AC button classes
      seatClass = extractCabinClassFromAC(fareCell);

      // Skip unavailable fare cells
      if (!isFareCellAvailable(fareCell)) return null;
    }

    // Strategy 2: Test page selectors (data-testid based)
    if (!isACDom) {
      pointPriceRaw = AP.extractTextContent(fareCell, SELECTORS.pointPrice);
      cashPriceRaw = AP.extractTextContent(fareCell, SELECTORS.cashPrice);
      extraFeesRaw = AP.extractTextContent(fareCell, SELECTORS.extraFees);
      seatClass = AP.extractTextContent(fareCell, SELECTORS.seatClass);
    }

    // Strategy 3: Heuristic text scanning
    if (!pointPriceRaw && !cashPriceRaw) {
      var allText = fareCell.querySelectorAll('*');
      for (var i = 0; i < allText.length; i++) {
        var t = (allText[i].textContent || '').trim();
        if (!pointPriceRaw && looksLikePoints(t) && t.match(/[kK]$/)) {
          pointPriceRaw = t;
        } else if (!extraFeesRaw && looksLikeFees(t)) {
          extraFeesRaw = t;
        }
      }
    }

    // Need at least one price to be useful
    if (!pointPriceRaw && !cashPriceRaw) return null;

    // Get shared flight info from the parent card
    var route = null;
    var departureTime = null;
    var arrivalTime = null;
    var date = null;
    var stops = null;

    if (cardElement) {
      // AC-specific: .bound-location elements (first=origin, second=dest)
      var locations = cardElement.querySelectorAll('.bound-location');
      if (locations.length >= 2) {
        route = locations[0].textContent.trim() + ' → ' + locations[1].textContent.trim();
      } else {
        route = AP.extractTextContent(cardElement, SELECTORS.routeInfo);
      }

      // AC-specific: .bound-time elements (first=departure, second=arrival)
      var times = cardElement.querySelectorAll('.bound-time');
      if (times.length >= 2) {
        departureTime = times[0].textContent.trim();
        arrivalTime = times[1].textContent.trim();
      } else {
        departureTime = AP.extractTextContent(cardElement, SELECTORS.departureTime);
        arrivalTime = AP.extractTextContent(cardElement, SELECTORS.arrivalTime);
      }

      date = AP.extractTextContent(cardElement, SELECTORS.date);

      // AC-specific: stop count from card text (e.g., "Nonstop", "1 stop", "2 stops")
      var cardText = cardElement.textContent || '';
      var stopMatch = cardText.match(/(\d+)\s*stop/i);
      if (stopMatch) {
        stops = stopMatch[1] + ' stop' + (stopMatch[1] !== '1' ? 's' : '');
      } else if (/nonstop|non-stop|direct/i.test(cardText)) {
        stops = 'Nonstop';
      }
    }

    // Infer seat class from test page data-testid if not found
    if (!seatClass) {
      var testId = fareCell.getAttribute('data-testid') || '';
      if (testId.indexOf('econ') !== -1) seatClass = 'Economy';
      else if (testId.indexOf('biz') !== -1) seatClass = 'Business';
      else if (testId.indexOf('prem') !== -1) seatClass = 'Premium Economy';
    }

    return {
      cashPriceRaw: cashPriceRaw,
      pointPriceRaw: pointPriceRaw,
      extraFeesRaw: extraFeesRaw,
      route: route,
      seatClass: seatClass,
      departureTime: departureTime,
      arrivalTime: arrivalTime,
      date: date,
      stops: stops,
      fareCellElement: fareCell,
      cardElement: cardElement,
    };
  };

  // ---- Card discovery ----

  AP.findFlightCards = function () {
    var selectors = SELECTORS.flightCard;
    if (!Array.isArray(selectors)) return [];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var cards = document.querySelectorAll(selectors[i]);
        if (cards.length > 0) return Array.from(cards);
      } catch (e) { /* skip */ }
    }
    return [];
  };

  AP.findFareCells = function (cardElement) {
    var cells = AP.trySelectorsAll(cardElement, SELECTORS.fareCell);
    if (cells.length > 0) return cells;
    return heuristicFindFareCells(cardElement);
  };

  AP.processFlightCards = function (cards) {
    var results = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var fareCells = AP.findFareCells(card);

      if (fareCells.length === 0) {
        if (processedCells.has(card)) continue;
        processedCells.add(card);
        var flightData = AP.extractFareCellData(card, card);
        if (!flightData) continue;
        var analysis = AP.analyzeFlightData(flightData);
        if (!analysis) continue;
        results.push({
          flightData: flightData,
          analysis: analysis,
          fareCellElement: card,
          cardElement: card,
        });
        continue;
      }

      for (var j = 0; j < fareCells.length; j++) {
        var cell = fareCells[j];
        if (processedCells.has(cell)) continue;
        processedCells.add(cell);
        var cellData = AP.extractFareCellData(cell, card);
        if (!cellData) continue;
        var cellAnalysis = AP.analyzeFlightData(cellData);
        if (!cellAnalysis) continue;
        results.push({
          flightData: cellData,
          analysis: cellAnalysis,
          fareCellElement: cell,
          cardElement: card,
        });
      }
    }
    return results;
  };

  // ---- MutationObserver ----

  AP.createMutationObserver = function (callback, debounceMs) {
    debounceMs = debounceMs || 300;
    var observer = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(callback, debounceMs);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  };

  // ---- Storage helpers ----

  AP.storeFlightsForPopup = function (analysisResults) {
    if (!analysisResults || analysisResults.length === 0) return;
    var summaries = analysisResults.map(function (r) {
      var a = r.analysis;
      var route = a.route || '';
      var parts = route.split(/[→\-–>]+/).map(function (s) { return s.trim(); });
      return {
        id: [route, a.date || '', a.departureTime || '', a.arrivalTime || '', a.seatClass || '']
          .join('-').replace(/\s+/g, '-').toLowerCase(),
        origin: parts[0] || '',
        destination: parts[1] || parts[0] || '',
        date: a.date || '',
        seatClassLabel: a.seatClass || 'Economy',
        cpp: a.cpp,
        rating: a.rating,
        ratingLabel: a.ratingLabel,
        ratingColor: a.ratingColor,
        cashSavings: a.cashSavings,
        cashPrice: a.cashPrice,
        pointPrice: a.pointPrice,
        currency: a.currency,
        departureTime: a.departureTime || '',
        arrivalTime: a.arrivalTime || '',
        stops: a.stops || '',
      };
    });
    try {
      chrome.runtime.sendMessage({ action: 'storeFlights', flights: summaries });
    } catch (e) { /* non-critical */ }
  };

  // ---- Aeroplan redemption page support ----

  /**
   * Detect if we're on the Aeroplan redemption page (vs cash booking).
   */
  AP.isAeroplanPage = function () {
    return window.location.href.indexOf('/aeroplan/redeem') !== -1;
  };

  /**
   * Extract route info from the Aeroplan URL for background cash lookup.
   * URL pattern: /aeroplan/redeem/availability/outbound?org0=YYZ&dest0=FLL&departureDate0=2026-04-01&ADT=1...
   */
  AP.extractRouteFromUrl = function () {
    var params = new URLSearchParams(window.location.search);
    var org = params.get('org0') || '';
    var dest = params.get('dest0') || '';
    var date = params.get('departureDate0') || '';
    var adults = parseInt(params.get('ADT') || '1', 10);

    // Fallback: AC strips URL params after SPA load.
    // Extract from page header (e.g., "Toronto (YYZ)  -  Vancouver (YVR)")
    if (!org || !dest) {
      var h2 = document.querySelector('h2');
      if (h2) {
        var codes = h2.textContent.match(/\(([A-Z]{3})\)/g);
        if (codes && codes.length >= 2) {
          org = org || codes[0].replace(/[()]/g, '');
          dest = dest || codes[codes.length - 1].replace(/[()]/g, '');
        }
      }
    }

    // Fallback date: extract from fare cell class (e.g., "YYZYVR-2026-09-03-0615")
    if (!date) {
      var cell = document.querySelector('.available-cabin.flight-cabin-cell');
      if (cell) {
        var match = (cell.className || '').match(/(\d{4}-\d{2}-\d{2})/);
        if (match) date = match[1];
      }
    }

    var returnDate = params.get('returnDate0') || '';
    var tripType = params.get('tripType') || 'O';

    return { org: org, dest: dest, date: date, adults: adults, returnDate: returnDate, tripType: tripType };
  };

  /**
   * Detect cabin type from an Aeroplan fare cell's class name.
   */
  function detectAeroplanCabin(fareCell) {
    var cls = fareCell.className || '';
    var prefixes = AP.AEROPLAN_CABIN_PREFIXES;
    if (!prefixes) return 'Economy';
    // Check longest prefix first (ecoPremium- before eco-)
    var keys = Object.keys(prefixes).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      if (cls.indexOf(keys[i]) !== -1) return prefixes[keys[i]];
    }
    return 'Economy';
  }

  /**
   * Scrape all Aeroplan fare cells from the page.
   * Returns array of { departure, arrival, cabin, pointsRaw, feesRaw, fareCellElement, rowElement }
   */
  AP.scrapeAeroplanFareCells = function () {
    var SEL = AP.AEROPLAN_SELECTORS;
    if (!SEL) return [];

    var rows = document.querySelectorAll(SEL.flightRow);
    var results = [];

    rows.forEach(function (row) {
      var card = row.querySelector(SEL.flightCard);
      if (!card) return;

      var depEl = card.querySelector(SEL.departureTime);
      var arrEl = card.querySelector(SEL.arrivalTime);
      var departure = depEl ? depEl.textContent.trim() : null;
      var arrival = arrEl ? arrEl.textContent.trim() : null;
      if (!departure) return;

      var fareCells = row.querySelectorAll(SEL.fareCell);
      fareCells.forEach(function (cell) {
        if (processedCells.has(cell)) return;
        processedCells.add(cell);

        var pointsEl = cell.querySelector(SEL.pointsTotal);
        var feesEl = cell.querySelector(SEL.remainingCash);
        var pointsRaw = pointsEl ? pointsEl.textContent.trim() : null;
        var feesRaw = feesEl ? feesEl.textContent.trim() : null;
        if (!pointsRaw) return;

        var cabin = detectAeroplanCabin(cell);

        // Scrape stop count from card text
        var cardText = card.textContent || '';
        var stopMatch = cardText.match(/(\d+)\s*stop/i);
        var stops = null;
        if (stopMatch) {
          stops = stopMatch[1] + ' stop' + (stopMatch[1] !== '1' ? 's' : '');
        } else if (/nonstop|non-stop|direct/i.test(cardText)) {
          stops = 'Nonstop';
        }

        results.push({
          departure: departure,
          arrival: arrival,
          cabin: cabin,
          stops: stops,
          pointsRaw: pointsRaw,
          feesRaw: feesRaw,
          fareCellElement: cell,
          cardElement: card,
          rowElement: row,
        });
      });
    });
    return results;
  };

  /**
   * Match Aeroplan fare cells with background-fetched cash prices.
   * Matches by departure time + cabin type.
   * Returns analysis results ready for badge injection.
   */
  AP.matchWithCashPrices = function (aeroplanCells, cashFlights) {
    // Build lookup: "departure|arrival|cabin" -> lowest cash price string.
    // Use lowest price when multiple fares exist for same flight+cabin
    // (e.g., basic economy vs flex economy).
    // Normalize time: strip leading zeros, whitespace, AM/PM
    function normalizeTime(t) {
      if (!t) return '';
      return t.trim()
        .replace(/\s*(am|pm|a\.m\.|p\.m\.)\s*/gi, '') // remove AM/PM
        .replace(/^0+(\d)/, '$1'); // strip leading zeros: "08:05" → "8:05"
    }

    function addToLookup(lookup, key, price) {
      var priceNum = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0;
      if (!lookup[key]) {
        lookup[key] = price;
      } else {
        var existingNum = parseFloat(String(lookup[key]).replace(/[^0-9.]/g, '')) || 0;
        if (priceNum > 0 && priceNum < existingNum) {
          lookup[key] = price;
        }
      }
    }

    var cashLookup = {};
    if (Array.isArray(cashFlights)) {
      cashFlights.forEach(function (flight) {
        if (!flight.departure || !Array.isArray(flight.fares)) return;
        var normDep = normalizeTime(flight.departure);
        var normArr = normalizeTime(flight.arrival);
        flight.fares.forEach(function (fare) {
          // Primary key: departure|arrival|cabin (unique per flight+cabin)
          var fullKey = normDep + '|' + normArr + '|' + fare.cabin;
          addToLookup(cashLookup, fullKey, fare.price);
        });
      });
    }
    console.log('[Autopilot] Cash lookup:', JSON.stringify(cashLookup));
    console.log('[Autopilot] Raw cash flights:', JSON.stringify(cashFlights));

    var results = [];
    aeroplanCells.forEach(function (cell) {
      var normDep = normalizeTime(cell.departure);
      var normArr = normalizeTime(cell.arrival);
      var fullKey = normDep + '|' + normArr + '|' + cell.cabin;
      var cashPriceRaw = cashLookup[fullKey] || null;

      // Fallback 1: departure|arrival only (ignore cabin mismatch)
      if (!cashPriceRaw) {
        var depArrPrefix = normDep + '|' + normArr + '|';
        var fallbackKeys = Object.keys(cashLookup).filter(function (k) {
          return k.indexOf(depArrPrefix) === 0;
        });
        if (fallbackKeys.length > 0) {
          cashPriceRaw = cashLookup[fallbackKeys[0]];
          console.warn('[Autopilot] Cabin mismatch for', fullKey, '— used fallback:', fallbackKeys[0], '→', cashPriceRaw);
        }
      }

      console.log('[Autopilot] Match:', fullKey, '→', cashPriceRaw || 'NO MATCH');

      // Build flightData object compatible with analyzeFlightData
      var flightData = {
        cashPriceRaw: cashPriceRaw,
        pointPriceRaw: cell.pointsRaw,
        extraFeesRaw: cell.feesRaw,
        route: AP.extractRouteFromUrl().org + ' → ' + AP.extractRouteFromUrl().dest,
        seatClass: cell.cabin,
        departureTime: cell.departure,
        arrivalTime: cell.arrival,
        stops: cell.stops,
        date: AP.extractRouteFromUrl().date,
        currencyHint: 'CAD',
      };

      var analysis = AP.analyzeFlightData(flightData);
      if (!analysis) return;

      results.push({
        flightData: flightData,
        analysis: analysis,
        fareCellElement: cell.fareCellElement,
        cardElement: cell.cardElement,
      });
    });
    return results;
  };

  // ---- Initialization ----

  AP.initScraper = function () {
    var allResults = [];
    var runPass = function () {
      var cards = AP.findFlightCards();
      var newResults = AP.processFlightCards(cards);
      if (newResults.length > 0) {
        allResults = allResults.concat(newResults);
        AP.storeFlightsForPopup(newResults);
      }
      return newResults;
    };
    var initialResults = runPass();
    var observer = AP.createMutationObserver(runPass, 300);
    return {
      runPass: runPass,
      cleanup: function () {
        clearTimeout(debounceTimer);
        observer.disconnect();
      },
    };
  };
})();

// Node/Jest export — ignored in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.Autopilot;
}
