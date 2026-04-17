/**
 * Autopilot Extension — Constants & Configuration
 *
 * Shared via window.Autopilot namespace (content scripts can't use ES modules).
 *
 * SELECTORS: Real Air Canada selectors discovered from live aircanada.com
 * inspection (March 2026). AC uses Angular with custom components.
 * Test-page selectors (data-testid) are kept as fallbacks.
 */
(function () {
  'use strict';

  var Autopilot = (window.Autopilot = window.Autopilot || {});

  Autopilot.BENCHMARK_CPP = { CAD: 2.1, USD: 1.6 };

  Autopilot.RATING_THRESHOLDS = { maxMultiplier: 1.2 };

  Autopilot.RATING_COLORS = {
    max: '#22C55E',
    good: '#EAB308',
    bad: '#EF4444',
  };

  Autopilot.RATING_LABELS = {
    max: 'Max Point Value',
    good: 'Good Point Value',
    bad: 'Bad Point Value',
  };

  Autopilot.STORAGE_KEYS = {
    currency: 'autopilot_currency',
    flights: 'autopilot_flights',
  };

  /**
   * CSS selectors for Air Canada DOM elements.
   * Each key is an array of fallback selectors tried in order.
   *
   * Real AC DOM (Angular):
   *   Flight row: .avail-flight-block-row-wrapper (id="flight-row-*")
   *   Fare cell:  .cabin-container > ac-ui-avail-fare-grid-cell-pres
   *   Price:      .cabin-price [aria-hidden="true"]  (visible price like "$450")
   *               .cabin-price .visually-hidden       (screen reader: "450CAD")
   *   Button:     .button-cell-container.cabin-fare-{idx}-{Y|O|J}
   *               aria-label="Select {Economy|Premium Economy|Business} seats starting from {price} $"
   *   Times:      .bound-time (first=departure, second=arrival)
   *   Cities:     .bound-location (first=origin, second=destination)
   *   Cabin codes: Y=Economy, O=Premium Economy, J=Business
   */
  Autopilot.SELECTORS = {
    flightCard: [
      // Real AC selectors
      '.avail-flight-block-row-wrapper',
      '[id^="flight-row-"]',
      // Test page / fallback selectors
      '[data-testid="flight-card"]',
      '.flight-card',
      '.flight-row',
    ],
    fareCell: [
      // Real AC selectors
      '.cabin-container',
      'ac-ui-avail-fare-grid-cell-pres',
      '.cabin-fare-container.availableCabin',
      // Test page / fallback selectors
      '[data-testid^="fare-cell"]',
      '.fare-cell',
    ],
    cashPrice: [
      // Real AC: visible price element
      '.cabin-price [aria-hidden="true"]',
      '.cabin-price',
      // Test page / fallback selectors
      '[data-testid="cash-price"]',
      '.cash-price',
    ],
    pointPrice: [
      // Real AC: same element, but shows points when in Aeroplan mode
      '.cabin-price [aria-hidden="true"]',
      '.cabin-price',
      // Test page / fallback selectors
      '[data-testid="points-price"]',
      '.points-price',
    ],
    extraFees: [
      // Real AC: fees shown in aria-label or separate element
      '.taxes-fees',
      '.surcharge-amount',
      // Test page / fallback selectors
      '[data-testid="extra-fees"]',
      '.extra-fees',
    ],
    routeInfo: [
      // Real AC selectors
      '.bound-location',
      // Test page / fallback selectors
      '[data-testid="route-info"]',
      '.route-info',
    ],
    seatClass: [
      // Test page / fallback selectors (AC uses button class pattern instead)
      '[data-testid="seat-class"]',
      '.seat-class',
    ],
    departureTime: [
      // Real AC selectors
      '.bound-time',
      // Test page / fallback selectors
      '[data-testid="departure-time"]',
      '.departure-time',
    ],
    arrivalTime: [
      // Real AC: second .bound-time in the row (handled in scraper)
      '.bound-time',
      // Test page / fallback selectors
      '[data-testid="arrival-time"]',
      '.arrival-time',
    ],
    date: [
      '[data-testid="flight-date"]',
      '.flight-date',
    ],
    // AC-specific selectors
    seatsLeft: [
      '.seats-left-text',
    ],
    cabinButton: [
      '[class*="button-cell-container"]',
    ],
  };

  /** Cabin code to display name mapping (from AC's button classes) */
  Autopilot.CABIN_CODES = {
    Y: 'Economy',
    O: 'Premium Economy',
    J: 'Business',
    F: 'First',
  };

  /**
   * Aeroplan redemption page selectors (different Angular app).
   * URL pattern: aircanada.com/aeroplan/redeem/availability/
   * Uses kilo-* web components with div.available-cabin fare cells.
   */
  Autopilot.AEROPLAN_SELECTORS = {
    flightRow: '.upsell-row',
    flightCard: 'kilo-flight-block-card-pres',
    cabinsContainer: '.cabins-container',
    fareCell: 'div.available-cabin.flight-cabin-cell',
    pointsTotal: '.points-total',
    remainingCash: '.remaining-cash',
    departureTime: '.departure-time',
    arrivalTime: '.arrival-time',
    seatsLeft: 'kilo-seats-left-message-pres',
  };

  /** Aeroplan fare cell class-prefix → cabin type */
  Autopilot.AEROPLAN_CABIN_PREFIXES = {
    'eco-': 'Economy',
    'ecoPremium-': 'Premium Economy',
    'business-': 'Business',
    'bus-': 'Business',
    'first-': 'First',
  };

  Autopilot.SELECTOR_VERSION = 3;

  Autopilot.URL_PATTERNS = [
    // Real AC booking URLs
    'aircanada.com/booking/',
    'aircanada.com/aeroplan/redeem',
    'aircanada.com/book/',
    // Catch-all for AC subpaths
    'aircanada.com/home/',
    // Local testing
    'localhost',
  ];

  Autopilot.CURRENCY_SYMBOLS = {
    $: 'CAD',
    'CA$': 'CAD',
    'C$': 'CAD',
    CAD: 'CAD',
    'US$': 'USD',
    USD: 'USD',
  };
})();

// Node/Jest export — ignored in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.Autopilot;
}
