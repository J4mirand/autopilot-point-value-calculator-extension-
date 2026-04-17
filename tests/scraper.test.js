/**
 * Scraper Module Tests
 *
 * Tests for DOM scraping functions in src/content/scraper.js.
 * Uses Jest's jsdom environment for DOM simulation.
 */

// Set up window.Autopilot namespace (constants + algorithm must load first)
global.window = global.window || {};
global.window.location = global.window.location || { href: '', search: '', pathname: '' };
global.chrome = {
  runtime: { sendMessage: jest.fn() },
  storage: { session: { set: jest.fn(), get: jest.fn() } },
};

require('../src/utils/constants.js');
require('../src/utils/algorithm.js');
const AP = require('../src/content/scraper.js');

// ---------------------------------------------------------------------------
// Helper: build a mock flight card DOM element (test page format)
// ---------------------------------------------------------------------------
function createMockFlightCard({
  cashPrice = '$1,601.00',
  pointPrice = '112,500',
  extraFees = '$115.00',
  route = 'Toronto (YYZ) → Bangkok (BKK)',
  seatClass = 'Economy',
  departureTime = '9:45 AM',
  arrivalTime = '2:30 PM',
} = {}) {
  const card = document.createElement('div');
  card.setAttribute('data-testid', 'flight-card');

  const cashEl = document.createElement('span');
  cashEl.setAttribute('data-testid', 'cash-price');
  cashEl.textContent = cashPrice;
  card.appendChild(cashEl);

  const pointEl = document.createElement('span');
  pointEl.setAttribute('data-testid', 'points-price');
  pointEl.textContent = pointPrice;
  card.appendChild(pointEl);

  const feeEl = document.createElement('span');
  feeEl.setAttribute('data-testid', 'extra-fees');
  feeEl.textContent = extraFees;
  card.appendChild(feeEl);

  const routeEl = document.createElement('span');
  routeEl.setAttribute('data-testid', 'route-info');
  routeEl.textContent = route;
  card.appendChild(routeEl);

  const classEl = document.createElement('span');
  classEl.setAttribute('data-testid', 'seat-class');
  classEl.textContent = seatClass;
  card.appendChild(classEl);

  const depEl = document.createElement('span');
  depEl.setAttribute('data-testid', 'departure-time');
  depEl.textContent = departureTime;
  card.appendChild(depEl);

  const arrEl = document.createElement('span');
  arrEl.setAttribute('data-testid', 'arrival-time');
  arrEl.textContent = arrivalTime;
  card.appendChild(arrEl);

  return card;
}

// ---------------------------------------------------------------------------
// trySelectors
// ---------------------------------------------------------------------------
describe('trySelectors', () => {
  test('returns the first matching element', () => {
    const container = document.createElement('div');
    const child = document.createElement('span');
    child.setAttribute('data-testid', 'cash-price');
    child.textContent = '$500';
    container.appendChild(child);

    const result = AP.trySelectors(container, [
      '[data-testid="nonexistent"]',
      '[data-testid="cash-price"]',
    ]);
    expect(result).toBe(child);
  });

  test('returns null when no selectors match', () => {
    const container = document.createElement('div');
    const result = AP.trySelectors(container, [
      '[data-testid="missing-1"]',
      '[data-testid="missing-2"]',
    ]);
    expect(result).toBeNull();
  });

  test('returns null for empty selector array', () => {
    const container = document.createElement('div');
    expect(AP.trySelectors(container, [])).toBeNull();
  });

  test('returns first match even when multiple selectors match', () => {
    const container = document.createElement('div');
    const first = document.createElement('span');
    first.className = 'price';
    first.textContent = 'first';
    container.appendChild(first);

    const second = document.createElement('span');
    second.setAttribute('data-testid', 'price');
    second.textContent = 'second';
    container.appendChild(second);

    const result = AP.trySelectors(container, ['.price', '[data-testid="price"]']);
    expect(result).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// extractTextContent
// ---------------------------------------------------------------------------
describe('extractTextContent', () => {
  test('returns text content of the first matching element', () => {
    const container = document.createElement('div');
    const child = document.createElement('span');
    child.setAttribute('data-testid', 'cash-price');
    child.textContent = '$1,601.00';
    container.appendChild(child);

    const result = AP.extractTextContent(container, ['[data-testid="cash-price"]']);
    expect(result).toBe('$1,601.00');
  });

  test('returns null when no elements match', () => {
    const container = document.createElement('div');
    const result = AP.extractTextContent(container, ['[data-testid="missing"]']);
    expect(result).toBeNull();
  });

  test('trims whitespace from text content', () => {
    const container = document.createElement('div');
    const child = document.createElement('span');
    child.className = 'price';
    child.textContent = '  $500.00  ';
    container.appendChild(child);

    const result = AP.extractTextContent(container, ['.price']);
    expect(result).toBe('$500.00');
  });

  test('returns null for empty text content', () => {
    const container = document.createElement('div');
    const child = document.createElement('span');
    child.className = 'empty';
    child.textContent = '   ';
    container.appendChild(child);

    const result = AP.extractTextContent(container, ['.empty']);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractFareCellData
// ---------------------------------------------------------------------------
describe('extractFareCellData', () => {
  test('extracts data from a test-page fare cell', () => {
    const card = createMockFlightCard();
    // Use the card itself as the fare cell (test page format: card IS the cell)
    const data = AP.extractFareCellData(card, card);

    expect(data).not.toBeNull();
    expect(data.cashPriceRaw).toBe('$1,601.00');
    expect(data.pointPriceRaw).toBe('112,500');
    expect(data.extraFeesRaw).toBe('$115.00');
    expect(data.seatClass).toBe('Economy');
  });

  test('returns null when no price data found', () => {
    const card = document.createElement('div');
    const data = AP.extractFareCellData(card, card);
    expect(data).toBeNull();
  });

  test('returns null when fareCell is null', () => {
    expect(AP.extractFareCellData(null, null)).toBeNull();
  });

  test('extracts route from card element', () => {
    const card = createMockFlightCard({ route: 'YYZ → FLL' });
    const data = AP.extractFareCellData(card, card);
    expect(data).not.toBeNull();
    expect(data.route).toBe('YYZ → FLL');
  });
});

// ---------------------------------------------------------------------------
// findFlightCards
// ---------------------------------------------------------------------------
describe('findFlightCards', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('finds flight cards by data-testid', () => {
    const card1 = createMockFlightCard();
    const card2 = createMockFlightCard({ cashPrice: '$800' });
    document.body.appendChild(card1);
    document.body.appendChild(card2);

    const cards = AP.findFlightCards();
    expect(cards).toHaveLength(2);
  });

  test('returns empty array when no flight cards exist', () => {
    const cards = AP.findFlightCards();
    expect(cards).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// processFlightCards
// ---------------------------------------------------------------------------
describe('processFlightCards', () => {
  beforeEach(() => {
    // Reset processed cells for each test
    AP.resetProcessedCells();
  });

  test('processes cards and returns analysis results', () => {
    const cards = [
      createMockFlightCard(),
      createMockFlightCard({ cashPrice: '$800', pointPrice: '20000' }),
    ];

    const results = AP.processFlightCards(cards);
    expect(results.length).toBeGreaterThan(0);
    // Each result should have analysis with cpp
    results.forEach(r => {
      expect(r.analysis).toBeDefined();
      expect(r.analysis.cpp).toBeDefined();
    });
  });

  test('skips already-processed cards on second call', () => {
    const card = createMockFlightCard();
    const firstResults = AP.processFlightCards([card]);
    const secondResults = AP.processFlightCards([card]);
    expect(secondResults).toHaveLength(0);
  });

  test('handles empty card array', () => {
    const results = AP.processFlightCards([]);
    expect(results).toHaveLength(0);
  });

  test('resetProcessedCells allows reprocessing', () => {
    const card = createMockFlightCard();
    AP.processFlightCards([card]);
    AP.resetProcessedCells();
    const results = AP.processFlightCards([card]);
    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// createMutationObserver
// ---------------------------------------------------------------------------
describe('createMutationObserver', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns a MutationObserver instance', () => {
    const callback = jest.fn();
    const observer = AP.createMutationObserver(callback);
    expect(observer).toBeInstanceOf(MutationObserver);
    observer.disconnect();
  });

  test('debounces callback invocations', async () => {
    const callback = jest.fn();
    const debounceMs = 300;
    const observer = AP.createMutationObserver(callback, debounceMs);

    const target = document.createElement('div');
    document.body.appendChild(target);

    // Trigger mutations
    target.appendChild(document.createElement('span'));
    target.appendChild(document.createElement('span'));

    // Flush microtasks so MutationObserver callbacks fire
    await Promise.resolve();

    // Not called yet (debounced via setTimeout)
    expect(callback).not.toHaveBeenCalled();

    // Advance past debounce window
    jest.advanceTimersByTime(debounceMs + 50);

    // Called once (debounced), not twice
    expect(callback).toHaveBeenCalledTimes(1);

    observer.disconnect();
  });
});

// ---------------------------------------------------------------------------
// storeFlightsForPopup
// ---------------------------------------------------------------------------
describe('storeFlightsForPopup', () => {
  beforeEach(() => {
    chrome.runtime.sendMessage.mockClear();
  });

  test('sends flight summaries via chrome.runtime.sendMessage', () => {
    const results = [
      {
        analysis: {
          route: 'YYZ → FLL',
          date: '2026-04-01',
          departureTime: '9:45 AM',
          arrivalTime: '2:30 PM',
          seatClass: 'Economy',
          cpp: 2.5,
          rating: 'good',
          ratingLabel: 'Good Point Value',
          ratingColor: '#EAB308',
          cashSavings: 100,
          cashPrice: 500,
          pointPrice: 20000,
          currency: 'CAD',
          stops: 'Nonstop',
        },
      },
    ];

    AP.storeFlightsForPopup(results);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'storeFlights',
        flights: expect.arrayContaining([
          expect.objectContaining({
            origin: 'YYZ',
            destination: 'FLL',
            cpp: 2.5,
            rating: 'good',
            departureTime: '9:45 AM',
            arrivalTime: '2:30 PM',
            stops: 'Nonstop',
          }),
        ]),
      })
    );
  });

  test('does nothing for empty results', () => {
    AP.storeFlightsForPopup([]);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('does nothing for null results', () => {
    AP.storeFlightsForPopup(null);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// extractRouteFromUrl
// ---------------------------------------------------------------------------
describe('extractRouteFromUrl', () => {
  test('extracts route from URL query params', () => {
    // Override window.location for this test
    const originalSearch = window.location.search;
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=YYZ&dest0=FLL&departureDate0=2026-04-01&ADT=1&tripType=O',
        search: '?org0=YYZ&dest0=FLL&departureDate0=2026-04-01&ADT=1&tripType=O',
        pathname: '/aeroplan/redeem/availability/outbound',
      },
      writable: true,
    });

    const route = AP.extractRouteFromUrl();
    expect(route.org).toBe('YYZ');
    expect(route.dest).toBe('FLL');
    expect(route.date).toBe('2026-04-01');
    expect(route.adults).toBe(1);
    expect(route.tripType).toBe('O');
  });

  test('extracts round trip params', () => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=YYZ&dest0=LAX&departureDate0=2026-04-15&returnDate0=2026-04-22&ADT=2&tripType=R',
        search: '?org0=YYZ&dest0=LAX&departureDate0=2026-04-15&returnDate0=2026-04-22&ADT=2&tripType=R',
        pathname: '/aeroplan/redeem/availability/outbound',
      },
      writable: true,
    });

    const route = AP.extractRouteFromUrl();
    expect(route.org).toBe('YYZ');
    expect(route.dest).toBe('LAX');
    expect(route.date).toBe('2026-04-15');
    expect(route.returnDate).toBe('2026-04-22');
    expect(route.tripType).toBe('R');
    expect(route.adults).toBe(2);
  });

  test('defaults to one-way when tripType missing', () => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=YYZ&dest0=FLL&departureDate0=2026-04-01&ADT=1',
        search: '?org0=YYZ&dest0=FLL&departureDate0=2026-04-01&ADT=1',
        pathname: '/aeroplan/redeem/availability/outbound',
      },
      writable: true,
    });

    const route = AP.extractRouteFromUrl();
    expect(route.tripType).toBe('O');
  });
});

// ---------------------------------------------------------------------------
// isAeroplanPage
// ---------------------------------------------------------------------------
describe('isAeroplanPage', () => {
  test('returns true for Aeroplan URL', () => {
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=YYZ' },
      writable: true,
    });
    expect(AP.isAeroplanPage()).toBe(true);
  });

  test('returns false for non-Aeroplan URL', () => {
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.aircanada.com/booking/results' },
      writable: true,
    });
    expect(AP.isAeroplanPage()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchWithCashPrices
// ---------------------------------------------------------------------------
describe('matchWithCashPrices', () => {
  beforeEach(() => {
    // Set URL for route extraction
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=YYZ&dest0=FLL&departureDate0=2026-04-01&ADT=1',
        search: '?org0=YYZ&dest0=FLL&departureDate0=2026-04-01&ADT=1',
        pathname: '/aeroplan/redeem/availability/outbound',
      },
      writable: true,
    });
  });

  test('matches Aeroplan cells with cash flights by time and cabin', () => {
    const aeroplanCells = [
      {
        departure: '9:45 AM',
        arrival: '2:30 PM',
        cabin: 'Economy',
        pointsRaw: '25,000',
        feesRaw: '+ CA$42.50',
        stops: 'Nonstop',
        fareCellElement: document.createElement('div'),
        cardElement: document.createElement('div'),
      },
    ];

    const cashFlights = [
      {
        departure: '9:45 AM',
        arrival: '2:30 PM',
        fares: [
          { cabin: 'Economy', price: '$450' },
          { cabin: 'Business', price: '$1,200' },
        ],
      },
    ];

    const results = AP.matchWithCashPrices(aeroplanCells, cashFlights);
    expect(results).toHaveLength(1);
    expect(results[0].analysis.cashPrice).toBe(450);
    expect(results[0].analysis.pointPrice).toBe(25000);
    expect(results[0].analysis.cpp).toBeDefined();
  });

  test('returns empty when no cash flights match', () => {
    const aeroplanCells = [
      {
        departure: '9:45 AM',
        arrival: '2:30 PM',
        cabin: 'Economy',
        pointsRaw: '25,000',
        feesRaw: '+ CA$42.50',
        fareCellElement: document.createElement('div'),
        cardElement: document.createElement('div'),
      },
    ];

    // Different times — no match
    const cashFlights = [
      {
        departure: '6:00 PM',
        arrival: '11:00 PM',
        fares: [{ cabin: 'Economy', price: '$450' }],
      },
    ];

    const results = AP.matchWithCashPrices(aeroplanCells, cashFlights);
    expect(results).toHaveLength(0);
  });

  test('falls back to departure+arrival match when cabin differs', () => {
    const aeroplanCells = [
      {
        departure: '9:45 AM',
        arrival: '2:30 PM',
        cabin: 'Premium Economy',
        pointsRaw: '40,000',
        feesRaw: '+ CA$60',
        fareCellElement: document.createElement('div'),
        cardElement: document.createElement('div'),
      },
    ];

    const cashFlights = [
      {
        departure: '9:45 AM',
        arrival: '2:30 PM',
        fares: [{ cabin: 'Economy', price: '$450' }], // Only Economy available
      },
    ];

    const results = AP.matchWithCashPrices(aeroplanCells, cashFlights);
    // Should still match via dep+arr fallback
    expect(results).toHaveLength(1);
    expect(results[0].analysis.cashPrice).toBe(450);
  });

  test('handles empty cash flights array', () => {
    const aeroplanCells = [
      {
        departure: '9:45 AM',
        arrival: '2:30 PM',
        cabin: 'Economy',
        pointsRaw: '25,000',
        feesRaw: '+ CA$42.50',
        fareCellElement: document.createElement('div'),
        cardElement: document.createElement('div'),
      },
    ];

    const results = AP.matchWithCashPrices(aeroplanCells, []);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Deduplication: storeFlightsForPopup ID uniqueness
// ---------------------------------------------------------------------------
describe('popup summary deduplication', () => {
  beforeEach(() => {
    chrome.runtime.sendMessage.mockClear();
  });

  test('different arrival times produce different IDs', () => {
    const results = [
      {
        analysis: {
          route: 'YYZ → FLL', date: '2026-04-01', departureTime: '9:45 AM',
          arrivalTime: '2:30 PM', seatClass: 'Economy', cpp: 2.5,
          rating: 'good', ratingLabel: 'Good', ratingColor: '#EAB308',
          cashSavings: 100, cashPrice: 500, pointPrice: 20000, currency: 'CAD', stops: 'Nonstop',
        },
      },
      {
        analysis: {
          route: 'YYZ → FLL', date: '2026-04-01', departureTime: '9:45 AM',
          arrivalTime: '5:00 PM', seatClass: 'Economy', cpp: 2.0,
          rating: 'bad', ratingLabel: 'Bad', ratingColor: '#EF4444',
          cashSavings: -50, cashPrice: 400, pointPrice: 20000, currency: 'CAD', stops: '1 stop',
        },
      },
    ];

    AP.storeFlightsForPopup(results);
    const call = chrome.runtime.sendMessage.mock.calls[0][0];
    const ids = call.flights.map(f => f.id);

    // IDs should be different because arrival times differ
    expect(ids[0]).not.toBe(ids[1]);
  });
});
