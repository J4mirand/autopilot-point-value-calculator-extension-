/**
 * Autopilot Extension — Pure Analysis Functions
 *
 * Shared via window.Autopilot namespace.
 * Every function is side-effect-free and fully testable.
 */
(function () {
  'use strict';

  var AP = (window.Autopilot = window.Autopilot || {});
  var C = AP; // constants are on the same namespace

  // ---- Parsing helpers ----

  /**
   * Parse an Aeroplan point string into an integer.
   * Handles: "112.5k", "112,500", "80K", "12500", etc.
   * @param {string} str
   * @returns {number|null}
   */
  AP.parsePointString = function (str) {
    if (str == null) return null;
    var cleaned = String(str).trim().replace(/\s/g, '');
    if (cleaned === '') return null;

    var match = cleaned.match(/^([0-9][0-9,]*\.?\d*)\s*([kK])?$/);
    if (!match) return null;

    var numericPart = match[1].replace(/,/g, '');
    var multiplier = match[2] ? 1000 : 1;
    var value = parseFloat(numericPart) * multiplier;

    if (isNaN(value) || value <= 0) return null;
    return Math.round(value);
  };

  /**
   * Parse a cash price string into a float.
   * Strips $, CA$, US$, CAD, USD and commas.
   * @param {string} str
   * @returns {number|null}
   */
  AP.parseCashPrice = function (str) {
    if (str == null) return null;
    var cleaned = String(str).trim();
    if (cleaned === '') return null;

    cleaned = cleaned.replace(/^\+\s*/, '');  // strip leading "+"
    cleaned = cleaned.replace(/CA\s*\$|US\s*\$|CAD|USD|\$/gi, '').trim();
    cleaned = cleaned.replace(/,/g, '');
    cleaned = cleaned.replace(/^[A-Z\s]+/i, '').trim();  // strip any remaining text prefix

    var value = parseFloat(cleaned);
    if (isNaN(value) || value < 0) return null;
    return Math.round(value * 100) / 100;
  };

  /**
   * Detect currency from a raw price string.
   * @param {string} str
   * @returns {"CAD"|"USD"}
   */
  AP.detectCurrency = function (str) {
    if (str == null) return 'CAD';
    var upper = String(str).toUpperCase().trim();
    if (upper.includes('US$') || upper.includes('USD') || upper.includes('U.S.')) {
      return 'USD';
    }
    return 'CAD';
  };

  // ---- Core calculations ----

  /**
   * Calculate cents-per-point (cpp).
   * @param {number} cashPrice
   * @param {number} pointPrice
   * @returns {number|null}
   */
  AP.calculatePointValue = function (cashPrice, pointPrice, extraFees) {
    if (
      cashPrice == null || pointPrice == null ||
      typeof cashPrice !== 'number' || typeof pointPrice !== 'number' ||
      pointPrice <= 0 || cashPrice < 0
    ) {
      return null;
    }
    // Subtract the taxes/fees that are still paid out-of-pocket on a points booking.
    // The points only "buy" the difference between the cash fare and the fees.
    var fees = (typeof extraFees === 'number' && extraFees > 0) ? extraFees : 0;
    var cashValueOfPoints = cashPrice - fees;
    if (cashValueOfPoints < 0) cashValueOfPoints = 0;
    var cpp = (cashValueOfPoints / pointPrice) * 100;
    return Math.round(cpp * 100) / 100;
  };

  /**
   * Calculate cash savings from using points.
   * Positive = points are cheaper, negative = cash is cheaper.
   * @param {number} cashPrice
   * @param {number} pointPrice
   * @param {number} extraFees
   * @param {number} benchmarkCpp
   * @returns {number|null}
   */
  AP.calculateCashSavings = function (cashPrice, pointPrice, extraFees, benchmarkCpp) {
    if (cashPrice == null || pointPrice == null || extraFees == null || benchmarkCpp == null) {
      return null;
    }
    var pointsCost = (pointPrice * benchmarkCpp) / 100 + extraFees;
    var savings = cashPrice - pointsCost;
    return Math.round(savings * 100) / 100;
  };

  // ---- Rating helpers ----

  /**
   * @param {number} cpp
   * @param {number} benchmarkCpp
   * @returns {"good"|"bad"}
   */
  AP.getRedemptionRating = function (cpp, benchmarkCpp) {
    if (cpp == null || benchmarkCpp == null || cpp <= 0) return 'bad';
    // Round to 1 decimal place to match the displayed value (e.g. "2.1 CPP")
    var displayCpp = Math.round(cpp * 10) / 10;
    if (displayCpp >= benchmarkCpp) return 'good';
    return 'bad';
  };

  /**
   * Assign ratings across a set of results.
   * The single highest CPP gets "max" (gold). Others at or above benchmark
   * get "good" (green). Below benchmark gets "bad" (red).
   * Mutates results in place.
   *
   * @param {Array} results - [{ analysis: { cpp, rating, ... }, ... }]
   */
  AP.assignPageRatings = function (results) {
    if (!results || results.length === 0) return;

    var bestIdx = -1;
    var bestCpp = -1;
    for (var i = 0; i < results.length; i++) {
      var a = results[i].analysis;
      if (a && a.cpp != null && a.cpp > bestCpp) {
        bestCpp = a.cpp;
        bestIdx = i;
      }
    }

    for (var j = 0; j < results.length; j++) {
      var analysis = results[j].analysis;
      if (!analysis) continue;
      var benchmarkCpp = analysis.benchmarkCpp || C.BENCHMARK_CPP.CAD;
      // Round to 1 decimal place to match the displayed value (e.g. "2.1 CPP")
      var displayCpp = Math.round((analysis.cpp || 0) * 10) / 10;
      var displayBest = Math.round(bestCpp * 10) / 10;
      if (j === bestIdx && displayBest >= benchmarkCpp) {
        analysis.rating = 'max';
      } else if (displayCpp >= benchmarkCpp) {
        analysis.rating = 'good';
      } else {
        analysis.rating = 'bad';
      }
      analysis.ratingLabel = AP.getRatingLabel(analysis.rating);
      analysis.ratingColor = AP.getRatingColor(analysis.rating);
    }
  };

  AP.getRatingLabel = function (rating) {
    return C.RATING_LABELS[rating] || C.RATING_LABELS.bad;
  };

  AP.getRatingColor = function (rating) {
    return C.RATING_COLORS[rating] || C.RATING_COLORS.bad;
  };

  AP.getBenchmarkCpp = function (currency) {
    return C.BENCHMARK_CPP[currency] || C.BENCHMARK_CPP.CAD;
  };

  // ---- Composite analysis ----

  /**
   * Analyse scraped flight data and return a full analysis object.
   * Returns null if minimum fields (cash + point price) can't be parsed.
   *
   * @param {Object} flightData - { cashPriceRaw, pointPriceRaw, extraFeesRaw, route, seatClass, ... }
   * @returns {Object|null}
   */
  AP.analyzeFlightData = function (flightData) {
    if (!flightData) return null;

    var cashPrice = AP.parseCashPrice(flightData.cashPriceRaw);
    var pointPrice = AP.parsePointString(flightData.pointPriceRaw);

    if (cashPrice == null || pointPrice == null) return null;

    var extraFees = AP.parseCashPrice(flightData.extraFeesRaw) || 0;
    var currency = AP.detectCurrency(flightData.currencyHint || flightData.cashPriceRaw || '');
    var benchmarkCpp = AP.getBenchmarkCpp(currency);
    var cpp = AP.calculatePointValue(cashPrice, pointPrice, extraFees);

    if (cpp == null) return null;

    var cashSavings = AP.calculateCashSavings(cashPrice, pointPrice, extraFees, benchmarkCpp);
    var rating = AP.getRedemptionRating(cpp, benchmarkCpp);
    var estimatedCashValue = Math.round(((pointPrice * benchmarkCpp) / 100) * 100) / 100;

    return {
      cashPrice: cashPrice,
      pointPrice: pointPrice,
      extraFees: extraFees,
      currency: currency,
      benchmarkCpp: benchmarkCpp,
      cpp: cpp,
      estimatedCashValue: estimatedCashValue,
      cashSavings: cashSavings,
      rating: rating,
      ratingLabel: AP.getRatingLabel(rating),
      ratingColor: AP.getRatingColor(rating),
      verdict: cashSavings >= 0 ? 'points' : 'cash',
      route: flightData.route || null,
      seatClass: flightData.seatClass || null,
      departureTime: flightData.departureTime || null,
      arrivalTime: flightData.arrivalTime || null,
      date: flightData.date || null,
      stops: flightData.stops || null,
    };
  };
})();

// Node/Jest export — ignored in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.Autopilot;
}
