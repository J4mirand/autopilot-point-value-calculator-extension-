/**
 * Algorithm Module Tests
 *
 * Tests for all pure calculation functions in src/utils/algorithm.js.
 * Source files use IIFE + window.Autopilot pattern; conditional module.exports
 * makes them requireable in Node/Jest.
 */

// Set up window.Autopilot namespace (constants must load first)
global.window = global.window || {};
require('../src/utils/constants.js');
const AP = require('../src/utils/algorithm.js');

// Destructure for convenience
const {
  parsePointString,
  parseCashPrice,
  detectCurrency,
  calculatePointValue,
  calculateCashSavings,
  getRedemptionRating,
  assignPageRatings,
  getRatingLabel,
  getRatingColor,
  getBenchmarkCpp,
  analyzeFlightData,
} = AP;

// ---------------------------------------------------------------------------
// parsePointString
// ---------------------------------------------------------------------------
describe('parsePointString', () => {
  test.each([
    ['112.5k', 112500],
    ['112.5K', 112500],
    ['80K', 80000],
    ['80k', 80000],
    ['1,200k', 1200000],
    ['112,500', 112500],
    ['112500', 112500],
    ['25000', 25000],
    ['1,200,000', 1200000],
    ['20000', 20000],
  ])('parses "%s" → %d', (input, expected) => {
    expect(parsePointString(input)).toBe(expected);
  });

  test.each([
    ['', null],
    [null, null],
    [undefined, null],
    ['abc', null],
    ['k', null],
    ['$500', null],
  ])('returns null for invalid input "%s"', (input, expected) => {
    expect(parsePointString(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// parseCashPrice
// ---------------------------------------------------------------------------
describe('parseCashPrice', () => {
  test.each([
    ['$1,601.00', 1601],
    ['$1601', 1601],
    ['CA$420', 420],
    ['CA$1,250.50', 1250.5],
    ['US$800', 800],
    ['US$1,100.99', 1100.99],
    ['CAD 500', 500],
    ['USD 750.25', 750.25],
    ['$0.99', 0.99],
    ['1601', 1601],
  ])('parses "%s" correctly', (input, expected) => {
    expect(parseCashPrice(input)).toBe(expected);
  });

  test.each([
    ['', null],
    [null, null],
    [undefined, null],
  ])('returns null for invalid input "%s"', (input, expected) => {
    expect(parseCashPrice(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// detectCurrency
// ---------------------------------------------------------------------------
describe('detectCurrency', () => {
  test('defaults to CAD for plain dollar amounts', () => {
    expect(detectCurrency('$1601')).toBe('CAD');
  });

  test('detects USD from US$ prefix', () => {
    expect(detectCurrency('US$800')).toBe('USD');
  });

  test('detects USD from USD text', () => {
    expect(detectCurrency('USD 420')).toBe('USD');
  });

  test('detects CAD from CA$ prefix', () => {
    expect(detectCurrency('CA$500')).toBe('CAD');
  });

  test('returns CAD for null input', () => {
    expect(detectCurrency(null)).toBe('CAD');
  });

  test('returns CAD for empty string', () => {
    expect(detectCurrency('')).toBe('CAD');
  });
});

// ---------------------------------------------------------------------------
// getBenchmarkCpp
// ---------------------------------------------------------------------------
describe('getBenchmarkCpp', () => {
  test('returns 2.1 for CAD', () => {
    expect(getBenchmarkCpp('CAD')).toBe(2.1);
  });

  test('returns 1.6 for USD', () => {
    expect(getBenchmarkCpp('USD')).toBe(1.6);
  });

  test('defaults to CAD for unknown currency', () => {
    expect(getBenchmarkCpp('EUR')).toBe(2.1);
  });
});

// ---------------------------------------------------------------------------
// calculatePointValue (cpp)
// ---------------------------------------------------------------------------
describe('calculatePointValue', () => {
  test('calculates cpp correctly subtracting fees', () => {
    // cash=$500, points=25000, fees=$56
    // cpp = ((500 - 56) / 25000) * 100 = 1.776 → 1.78
    expect(calculatePointValue(500, 25000, 56)).toBe(1.78);
  });

  test('calculates cpp with zero fees (same as no fees)', () => {
    // cpp = (800 / 20000) * 100 = 4.0
    expect(calculatePointValue(800, 20000, 0)).toBe(4.0);
  });

  test('calculates cpp when no fees argument provided', () => {
    // cpp = (800 / 20000) * 100 = 4.0 (fees default to 0)
    expect(calculatePointValue(800, 20000)).toBe(4.0);
  });

  test('calculates cpp for Toronto→Bangkok with fees', () => {
    // cash=$1601, points=112500, fees=$56
    // cpp = ((1601 - 56) / 112500) * 100 = 1.3733... → 1.37
    expect(calculatePointValue(1601, 112500, 56)).toBe(1.37);
  });

  test('calculates cpp for benchmark-matching scenario with fees', () => {
    // cash=$420, points=20000, fees=$30
    // cpp = ((420 - 30) / 20000) * 100 = 1.95
    expect(calculatePointValue(420, 20000, 30)).toBe(1.95);
  });

  test('clamps to 0 cpp when fees exceed cash price', () => {
    // cash=$50, points=25000, fees=$100 → cashValueOfPoints = 0
    expect(calculatePointValue(50, 25000, 100)).toBe(0);
  });

  test('returns null when pointPrice is 0', () => {
    expect(calculatePointValue(500, 0, 56)).toBeNull();
  });

  test('returns null when pointPrice is null', () => {
    expect(calculatePointValue(500, null, 56)).toBeNull();
  });

  test('returns null when cashPrice is null', () => {
    expect(calculatePointValue(null, 20000, 56)).toBeNull();
  });

  test('handles decimal results with rounding', () => {
    // cpp = ((333 - 33) / 10000) * 100 = 3.0
    expect(calculatePointValue(333, 10000, 33)).toBe(3.0);
  });
});

// ---------------------------------------------------------------------------
// calculateCashSavings
// ---------------------------------------------------------------------------
describe('calculateCashSavings', () => {
  test('Toronto→Bangkok: negative savings (bad deal)', () => {
    // cashSavings = 1601 - ((112500 * 2.1 / 100) + 115)
    //             = 1601 - (2362.5 + 115)
    //             = 1601 - 2477.5
    //             = -876.5
    const result = calculateCashSavings(1601, 112500, 115, 2.1);
    expect(result).toBe(-876.5);
  });

  test('positive savings (good deal)', () => {
    // cashSavings = 800 - ((20000 * 2.1 / 100) + 0)
    //             = 800 - 420 = 380
    const result = calculateCashSavings(800, 20000, 0, 2.1);
    expect(result).toBe(380);
  });

  test('zero extra fees', () => {
    const result = calculateCashSavings(420, 20000, 0, 2.1);
    // 420 - (420 + 0) = 0
    expect(result).toBe(0);
  });

  test('returns null when inputs are null', () => {
    expect(calculateCashSavings(null, 20000, 0, 2.1)).toBeNull();
    expect(calculateCashSavings(500, null, 0, 2.1)).toBeNull();
  });

  test('USD benchmark changes the calculation', () => {
    // cashSavings = 800 - ((20000 * 1.6 / 100) + 0)
    //             = 800 - 320 = 480
    const result = calculateCashSavings(800, 20000, 0, 1.6);
    expect(result).toBe(480);
  });
});

// ---------------------------------------------------------------------------
// getRedemptionRating
// Note: This function only returns 'good' or 'bad'.
// The 'max' rating is assigned by assignPageRatings across a set of results.
// ---------------------------------------------------------------------------
describe('getRedemptionRating', () => {
  describe('with CAD benchmark (2.1)', () => {
    const benchmark = 2.1;

    test('returns "good" when cpp >= benchmark', () => {
      expect(getRedemptionRating(2.1, benchmark)).toBe('good');
      expect(getRedemptionRating(4.0, benchmark)).toBe('good');
      expect(getRedemptionRating(3.0, benchmark)).toBe('good');
    });

    test('returns "bad" when cpp < benchmark', () => {
      expect(getRedemptionRating(1.42, benchmark)).toBe('bad');
      expect(getRedemptionRating(2.0, benchmark)).toBe('bad');
      expect(getRedemptionRating(0.5, benchmark)).toBe('bad');
    });

    test('returns "bad" for null or zero cpp', () => {
      expect(getRedemptionRating(null, benchmark)).toBe('bad');
      expect(getRedemptionRating(0, benchmark)).toBe('bad');
    });
  });

  describe('with USD benchmark (1.6)', () => {
    const benchmark = 1.6;

    test('returns "good" when cpp >= 1.6', () => {
      expect(getRedemptionRating(1.6, benchmark)).toBe('good');
      expect(getRedemptionRating(4.0, benchmark)).toBe('good');
    });

    test('returns "bad" when cpp < 1.6', () => {
      expect(getRedemptionRating(1.42, benchmark)).toBe('bad');
      expect(getRedemptionRating(1.0, benchmark)).toBe('bad');
    });
  });

  test('currency switching: same cpp rated differently', () => {
    // cpp of 1.7: "bad" in CAD (< 2.1), "good" in USD (>= 1.6)
    expect(getRedemptionRating(1.7, 2.1)).toBe('bad');
    expect(getRedemptionRating(1.7, 1.6)).toBe('good');
  });
});

// ---------------------------------------------------------------------------
// assignPageRatings — assigns 'max' to the best cpp, 'good'/'bad' to the rest
// ---------------------------------------------------------------------------
describe('assignPageRatings', () => {
  test('assigns "max" to highest cpp when above benchmark', () => {
    const results = [
      { analysis: { cpp: 4.0, benchmarkCpp: 2.1 } },
      { analysis: { cpp: 2.5, benchmarkCpp: 2.1 } },
      { analysis: { cpp: 1.0, benchmarkCpp: 2.1 } },
    ];
    assignPageRatings(results);
    expect(results[0].analysis.rating).toBe('max');
    expect(results[1].analysis.rating).toBe('good');
    expect(results[2].analysis.rating).toBe('bad');
  });

  test('does not assign "max" when best cpp is below benchmark', () => {
    const results = [
      { analysis: { cpp: 1.5, benchmarkCpp: 2.1 } },
      { analysis: { cpp: 1.0, benchmarkCpp: 2.1 } },
    ];
    assignPageRatings(results);
    expect(results[0].analysis.rating).toBe('bad');
    expect(results[1].analysis.rating).toBe('bad');
  });

  test('handles single result', () => {
    const results = [
      { analysis: { cpp: 3.0, benchmarkCpp: 2.1 } },
    ];
    assignPageRatings(results);
    expect(results[0].analysis.rating).toBe('max');
  });

  test('handles empty array', () => {
    const results = [];
    assignPageRatings(results);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getRatingLabel
// ---------------------------------------------------------------------------
describe('getRatingLabel', () => {
  test('returns correct label for each rating', () => {
    expect(getRatingLabel('max')).toBe('Max Point Value');
    expect(getRatingLabel('good')).toBe('Good Point Value');
    expect(getRatingLabel('bad')).toBe('Bad Point Value');
  });
});

// ---------------------------------------------------------------------------
// getRatingColor
// ---------------------------------------------------------------------------
describe('getRatingColor', () => {
  test('returns correct hex color for each rating', () => {
    expect(getRatingColor('max')).toBe('#22C55E');
    expect(getRatingColor('good')).toBe('#EAB308');
    expect(getRatingColor('bad')).toBe('#EF4444');
  });
});

// ---------------------------------------------------------------------------
// analyzeFlightData — integration-style tests
// Note: analyzeFlightData uses getRedemptionRating which returns 'good'/'bad'.
// The 'max' rating is only assigned by assignPageRatings across multiple results.
// ---------------------------------------------------------------------------
describe('analyzeFlightData', () => {
  test('Toronto→Bangkok full analysis (bad deal)', () => {
    const result = analyzeFlightData({
      cashPriceRaw: '$1,601.00',
      pointPriceRaw: '112.5k',
      extraFeesRaw: '$115',
      currencyHint: null,
      route: 'YYZ → BKK',
      seatClass: 'Economy',
    });

    expect(result).not.toBeNull();
    expect(result.cashPrice).toBe(1601);
    expect(result.pointPrice).toBe(112500);
    // CPP = (1601 - 115) / 112500 * 100 = 1.32
    expect(result.cpp).toBe(1.32);
    expect(result.rating).toBe('bad');
    expect(result.ratingLabel).toBe('Bad Point Value');
    expect(result.ratingColor).toBe('#EF4444');
    expect(result.cashSavings).toBe(-876.5);
    expect(result.currency).toBe('CAD');
    expect(result.benchmarkCpp).toBe(2.1);
    expect(result.verdict).toBe('cash');
  });

  test('high-value scenario (good rating before page assignment)', () => {
    const result = analyzeFlightData({
      cashPriceRaw: '$800',
      pointPriceRaw: '20000',
      extraFeesRaw: '$0',
      currencyHint: null,
      route: 'YYZ → YVR',
      seatClass: 'Business',
    });

    expect(result).not.toBeNull();
    expect(result.cashPrice).toBe(800);
    expect(result.pointPrice).toBe(20000);
    expect(result.cpp).toBe(4.0);
    // Individual analysis: 'good' (not 'max' — that's assigned by assignPageRatings)
    expect(result.rating).toBe('good');
    expect(result.verdict).toBe('points');
  });

  test('benchmark-matching scenario', () => {
    const result = analyzeFlightData({
      cashPriceRaw: 'CA$420',
      pointPriceRaw: '20000',
      extraFeesRaw: '$0',
      currencyHint: null,
      route: 'YYZ → YUL',
      seatClass: 'Economy',
    });

    expect(result).not.toBeNull();
    expect(result.cpp).toBe(2.1);
    expect(result.rating).toBe('good');
  });

  test('USD currency detection via cashPriceRaw', () => {
    const result = analyzeFlightData({
      cashPriceRaw: 'US$800',
      pointPriceRaw: '20000',
      extraFeesRaw: '$0',
      currencyHint: null,
      route: 'LAX → YYZ',
      seatClass: 'Economy',
    });

    expect(result).not.toBeNull();
    expect(result.currency).toBe('USD');
    expect(result.benchmarkCpp).toBe(1.6);
    expect(result.cpp).toBe(4.0);
    expect(result.rating).toBe('good');
  });

  test('USD via currencyHint override', () => {
    const result = analyzeFlightData({
      cashPriceRaw: '$800',
      pointPriceRaw: '20000',
      extraFeesRaw: '$0',
      currencyHint: 'USD',
      route: 'LAX → YYZ',
      seatClass: 'Economy',
    });

    expect(result).not.toBeNull();
    expect(result.currency).toBe('USD');
    expect(result.benchmarkCpp).toBe(1.6);
  });

  test('returns null when cashPriceRaw is missing', () => {
    expect(analyzeFlightData({
      cashPriceRaw: '',
      pointPriceRaw: '20000',
      extraFeesRaw: '$0',
    })).toBeNull();
  });

  test('returns null when pointPriceRaw is missing', () => {
    expect(analyzeFlightData({
      cashPriceRaw: '$800',
      pointPriceRaw: '',
      extraFeesRaw: '$0',
    })).toBeNull();
  });

  test('returns null when flightData is null', () => {
    expect(analyzeFlightData(null)).toBeNull();
  });

  test('returns null when flightData is undefined', () => {
    expect(analyzeFlightData(undefined)).toBeNull();
  });

  test('handles missing extraFeesRaw gracefully (defaults to 0)', () => {
    const result = analyzeFlightData({
      cashPriceRaw: '$800',
      pointPriceRaw: '20000',
      extraFeesRaw: null,
    });

    expect(result).not.toBeNull();
    expect(result.cpp).toBe(4.0);
    expect(result.extraFees).toBe(0);
  });

  test('passes through flight metadata', () => {
    const result = analyzeFlightData({
      cashPriceRaw: '$500',
      pointPriceRaw: '25000',
      extraFeesRaw: '$20',
      route: 'YYZ → FLL',
      seatClass: 'Economy',
      departureTime: '9:45 AM',
      arrivalTime: '2:30 PM',
      date: '2026-04-01',
      stops: 'Nonstop',
    });

    expect(result).not.toBeNull();
    expect(result.route).toBe('YYZ → FLL');
    expect(result.seatClass).toBe('Economy');
    expect(result.departureTime).toBe('9:45 AM');
    expect(result.arrivalTime).toBe('2:30 PM');
    expect(result.date).toBe('2026-04-01');
    expect(result.stops).toBe('Nonstop');
  });
});

// ---------------------------------------------------------------------------
// End-to-end: analyzeFlightData + assignPageRatings
// ---------------------------------------------------------------------------
describe('Full pipeline: analyze + assign ratings', () => {
  test('assigns max/good/bad across multiple flights', () => {
    const flights = [
      { cashPriceRaw: '$800', pointPriceRaw: '20000', extraFeesRaw: '$0', route: 'YYZ → YVR', seatClass: 'Business' },
      { cashPriceRaw: '$500', pointPriceRaw: '20000', extraFeesRaw: '$0', route: 'YYZ → YVR', seatClass: 'Economy' },
      { cashPriceRaw: '$200', pointPriceRaw: '20000', extraFeesRaw: '$0', route: 'YYZ → YVR', seatClass: 'Economy' },
    ];

    const results = flights.map(f => {
      const analysis = analyzeFlightData(f);
      return { analysis };
    });

    assignPageRatings(results);

    // 4.0 cpp = max (highest and above benchmark)
    expect(results[0].analysis.rating).toBe('max');
    expect(results[0].analysis.ratingLabel).toBe('Max Point Value');
    expect(results[0].analysis.ratingColor).toBe('#22C55E');

    // 2.5 cpp = good (above 2.1 benchmark)
    expect(results[1].analysis.rating).toBe('good');

    // 1.0 cpp = bad (below 2.1 benchmark)
    expect(results[2].analysis.rating).toBe('bad');
  });

  test('no max when all below benchmark', () => {
    const flights = [
      { cashPriceRaw: '$200', pointPriceRaw: '20000', extraFeesRaw: '$0' },
      { cashPriceRaw: '$100', pointPriceRaw: '20000', extraFeesRaw: '$0' },
    ];

    const results = flights.map(f => ({ analysis: analyzeFlightData(f) }));
    assignPageRatings(results);

    expect(results[0].analysis.rating).toBe('bad');
    expect(results[1].analysis.rating).toBe('bad');
  });
});
