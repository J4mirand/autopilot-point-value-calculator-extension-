/**
 * Autopilot Extension — Background Service Worker
 *
 * Handles message routing between content scripts and the popup,
 * and manages chrome.storage for flight data and user preferences.
 */

var KEYS = {
  currency: 'autopilot_currency',
};

function flightsKey(tabId) {
  return 'autopilot_flights_' + tabId;
}

// ---- Message handler ----

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.action) return false;

  switch (message.action) {
    case 'storeFlights':
      var senderTabId = sender && sender.tab ? sender.tab.id : null;
      if (!senderTabId) {
        sendResponse({ ok: false });
        return false;
      }
      storeFlights(senderTabId, message.flights).then(function () {
        sendResponse({ ok: true });
        // Notify popup if open — include tabId so popup knows which tab updated
        chrome.runtime.sendMessage({ action: 'flightsUpdated', tabId: senderTabId }).catch(function () {});
      });
      return true; // async

    case 'getFlights':
      getFlights(message.tabId).then(function (flights) {
        sendResponse(flights); // returns the array directly
      });
      return true;

    case 'setCurrency':
      setCurrency(message.currency).then(function () {
        sendResponse({ ok: true });
      });
      return true;

    case 'getCurrency':
      getCurrency().then(function (c) {
        sendResponse(c);
      });
      return true;

    case 'clearFlights':
      var clearTabId = sender && sender.tab ? sender.tab.id : null;
      if (clearTabId) {
        chrome.storage.session.remove(flightsKey(clearTabId)).then(function () {
          sendResponse({ ok: true });
        }).catch(function () {
          sendResponse({ ok: false });
        });
      } else {
        sendResponse({ ok: false });
      }
      return true;

    case 'fetchCashPrices':
      fetchCashPrices(message.route).then(function (prices) {
        if (message.storeAsReturn) {
          // Pre-fetched return prices — store in session for the inbound page to pick up
          chrome.storage.session.set({ autopilot_return_cash_prices: prices }).catch(function () {});
          console.log('[Autopilot BG] Stored', prices.length, 'pre-fetched return cash prices.');
          sendResponse({ ok: true, prices: prices });
        } else {
          sendResponse({ ok: true, prices: prices });
        }
      }).catch(function (err) {
        console.warn('[Autopilot BG] fetchCashPrices error:', err);
        sendResponse({ ok: false, prices: [] });
      });
      return true;

    case 'getReturnCashPrices':
      chrome.storage.session.get('autopilot_return_cash_prices').then(function (data) {
        var prices = data.autopilot_return_cash_prices || [];
        sendResponse({ prices: prices });
      }).catch(function () {
        sendResponse({ prices: [] });
      });
      return true;

    default:
      return false;
  }
});

// ---- Clean up flights when a tab is closed ----
chrome.tabs.onRemoved.addListener(function (tabId) {
  var key = flightsKey(tabId);
  chrome.storage.session.remove(key).catch(function () {});
  // Clean up SPA re-injection state for this tab
  delete reinjectedUrls[tabId];
  if (reinjectionTimers[tabId]) {
    clearTimeout(reinjectionTimers[tabId]);
    delete reinjectionTimers[tabId];
  }
});

// ---- Track background fetch tabs to prevent content script chain reactions ----
// When we open a tab to scrape cash prices, content scripts auto-inject via manifest.
// Without this guard, those scripts would trigger MORE fetches → infinite loop.
var fetchingTabs = new Set();

// ---- Re-inject content scripts on SPA navigation ----
// When AC does a History pushState (e.g., outbound → inbound), the content
// script doesn't re-run. We detect the URL change and re-inject all scripts
// so the new page gets a fresh pipeline (same as a full page load).
var reinjectedUrls = {}; // tabId → lastUrl, to avoid double-injection
var reinjectionTimers = {}; // tabId → timeout, debounce rapid pushState calls
chrome.webNavigation.onHistoryStateUpdated.addListener(
  function (details) {
    if (details.frameId !== 0) return; // only top frame
    var tabId = details.tabId;
    var url = details.url || '';
    // Only act on Aeroplan redemption pages
    if (url.indexOf('aircanada.com/aeroplan/redeem') === -1) return;
    // Skip background fetch tabs
    if (fetchingTabs.has(tabId)) return;
    // Skip if we already injected for this exact URL
    if (reinjectedUrls[tabId] === url) return;
    reinjectedUrls[tabId] = url;

    console.log('[Autopilot BG] SPA navigation detected:', url);

    // Debounce: AC's Angular may fire multiple rapid pushState calls during a
    // single search. Without debouncing, each pushState schedules a separate
    // re-injection → duplicate fetch tabs. Only the last one wins.
    if (reinjectionTimers[tabId]) {
      clearTimeout(reinjectionTimers[tabId]);
    }
    reinjectionTimers[tabId] = setTimeout(function () {
      delete reinjectionTimers[tabId];
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [
          'src/utils/constants.js',
          'src/utils/algorithm.js',
          'src/content/scraper.js',
          'src/content/overlay.js',
          'src/content/tooltip.js',
          'src/content/content_main.js',
        ],
      }).then(function () {
        console.log('[Autopilot BG] Content scripts re-injected for tab', tabId);
      }).catch(function (err) {
        console.warn('[Autopilot BG] Re-injection failed:', err);
      });
    }, 1500);
  },
  { url: [{ hostContains: 'aircanada.com' }] }
);

// ---- Storage operations ----

async function storeFlights(tabId, flights) {
  if (!Array.isArray(flights) || !tabId) return;

  var key = flightsKey(tabId);
  try {
    var existing = [];
    try {
      var data = await chrome.storage.session.get(key);
      existing = data[key] || [];
    } catch (e) {
      // session storage might not be available
    }

    // Merge: deduplicate by id, newer wins
    var map = {};
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].id) map[existing[i].id] = existing[i];
    }
    for (var j = 0; j < flights.length; j++) {
      if (flights[j].id) map[flights[j].id] = flights[j];
    }

    var merged = Object.values(map);
    await chrome.storage.session.set({ [key]: merged });
  } catch (err) {
    console.warn('[Autopilot BG] Failed to store flights:', err);
  }
}

async function getFlights(tabId) {
  if (!tabId) return [];
  var key = flightsKey(tabId);
  try {
    var data = await chrome.storage.session.get(key);
    var flights = data[key] || [];
    // Sort by cpp descending
    flights.sort(function (a, b) { return (b.cpp || 0) - (a.cpp || 0); });
    return flights;
  } catch (err) {
    console.warn('[Autopilot BG] Failed to get flights:', err);
    return [];
  }
}

async function setCurrency(currency) {
  if (currency !== 'CAD' && currency !== 'USD') return;
  try {
    await chrome.storage.local.set({ [KEYS.currency]: currency });
  } catch (err) {
    console.warn('[Autopilot BG] Failed to set currency:', err);
  }
}

async function getCurrency() {
  try {
    var data = await chrome.storage.local.get(KEYS.currency);
    return data[KEYS.currency] || 'CAD';
  } catch (err) {
    return 'CAD';
  }
}

// ---- Background cash price fetching ----

/**
 * Open a hidden tab to the cash booking page for the same route,
 * scrape cash prices, close the tab, and return the data.
 *
 * @param {Object} route - { org, dest, date, adults, tripType }
 * @returns {Array} - [{ departure, arrival, fares: [{ cabin, price }] }]
 */
/**
 * Set the departure date on the AC search form by opening the calendar and clicking the target day.
 * @param {number} tabId
 * @param {string} dateStr - ISO date string e.g. "2026-09-08"
 */
async function fillDateField(tabId, dateStr) {
  if (!dateStr) return;
  var parts = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!parts) return;
  var targetYear = parseInt(parts[1], 10);
  var targetMonth = parseInt(parts[2], 10); // 1-based
  var targetDay = parseInt(parts[3], 10);
  var monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var targetMonthName = monthNames[targetMonth];

  // Click the date field to open the calendar
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function () {
      var dateInput = document.querySelector('#bkmg-desktop_travelDates, #bkmg-desktop_travelDates-formfield-1');
      if (dateInput) dateInput.click();
    },
  });
  await delay(1000);

  // Find the target month and click the target day
  var result = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function (monthName, year, day) {
      var months = document.querySelectorAll('.abc-calendar-month, [class*="month-container"]');
      var clicked = false;
      months.forEach(function (m) {
        if (clicked) return;
        var header = m.querySelector('[class*="month-name"], [class*="month-title"], h3, h4');
        var headerText = header ? header.textContent.trim() : '';
        if (headerText.indexOf(monthName) !== -1 && headerText.indexOf(String(year)) !== -1) {
          var days = m.querySelectorAll('.abc-calendar-day');
          days.forEach(function (d) {
            if (clicked) return;
            var p = d.querySelector('p.date');
            if (p && p.textContent.trim() === String(day)) {
              d.click();
              clicked = true;
            }
          });
        }
      });
      return clicked ? 'clicked ' + monthName + ' ' + day : 'day not found';
    },
    args: [targetMonthName, targetYear, targetDay],
  });

  var msg = (result && result[0] && result[0].result) || 'unknown';
  console.log('[Autopilot BG] fillDateField:', msg);

  // Close the calendar overlay by clicking outside or pressing Escape
  await delay(300);
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function () {
      // Try closing via close button first
      var closeBtn = document.querySelector('.abc-calendar-wrapper button[aria-label*="Close"], .abc-calendar-wrapper button[aria-label*="close"]');
      if (closeBtn) { closeBtn.click(); return 'closed via button'; }
      // Fallback: press Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return 'pressed Escape';
    },
  });
  await delay(500);
}

/**
 * Fill an AC search form airport field by typing the code and clicking the autocomplete suggestion.
 * AC's Angular app ignores URL params and uses session-cached values, so we must fill programmatically.
 */
async function fillAirportField(tabId, selector, airportCode) {
  // Clear the field and type the airport code
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function (sel, code) {
      var input = document.querySelector(sel);
      if (!input) return 'not found';
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed ' + code;
    },
    args: [selector, airportCode],
  });

  // Wait for autocomplete dropdown to appear
  await delay(1500);

  // Click the first matching suggestion
  var result = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function (code) {
      var results = document.querySelectorAll('.location-search-result');
      for (var i = 0; i < results.length; i++) {
        if (results[i].textContent.indexOf(code) !== -1) {
          results[i].click();
          return 'clicked ' + code;
        }
      }
      if (results.length > 0) {
        results[0].click();
        return 'clicked first result';
      }
      return 'no suggestions found';
    },
    args: [airportCode],
  });

  var msg = (result && result[0] && result[0].result) || 'unknown';
  console.log('[Autopilot BG] fillAirportField', selector, ':', msg);
  await delay(500);
}

async function fetchCashPrices(route) {
  if (!route || !route.org || !route.dest || !route.date) return [];

  var adults = route.adults || 1;
  var flightsUrl = 'https://www.aircanada.com/home/ca/en/aco/flights'
    + '?org0=' + route.org
    + '&dest0=' + route.dest
    + '&departureDate0=' + route.date
    + '&ADT=' + adults
    + '&tripType=O'
    + '&_autopilot_fetch=1';

  var tab = null;
  try {
    // Step 1: Open the flights search page
    console.log('[Autopilot BG] Step 1: Opening flights page...');
    tab = await chrome.tabs.create({ url: flightsUrl, active: false });
    fetchingTabs.add(tab.id);
    console.log('[Autopilot BG] Tab created:', tab.id, '— waiting for load...');
    await waitForTabComplete(tab.id, 20000);
    console.log('[Autopilot BG] Flights page loaded.');

    // Step 2: Always set trip type to One-way.
    // AC ignores URL params and uses session-cached form values.
    // If the user did a round trip Aeroplan search, the session cache has
    // "round trip" — so even outbound fetches get wrong (round trip) cash prices.
    console.log('[Autopilot BG] Step 2: Setting trip type to One-way...');
    await delay(2000); // Wait for Angular form to initialize
    var tripResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () {
        var btn = document.querySelector('#bkmgFlights-trip-selector_tripTypeBtn');
        if (!btn) return 'trip type button not found';
        if (/one.?way/i.test(btn.textContent)) return 'already one-way';
        btn.click();
        return 'dropdown opened';
      },
    });
    console.log('[Autopilot BG] Trip type step 1:', tripResult && tripResult[0] && tripResult[0].result);
    await delay(1000);

    var tripResult2 = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () {
        var radio = document.querySelector('#bkmgFlights-trip-selector_tripTypeSelector_O');
        if (radio) {
          radio.click();
          var label = radio.closest('.abc-radio-btn-wrapper, .abc-form-element-wrapper');
          if (label) label.click();
        }
        var labels = document.querySelectorAll('label');
        for (var i = 0; i < labels.length; i++) {
          if (/one.?way/i.test(labels[i].textContent)) {
            labels[i].click();
            return 'clicked one-way label';
          }
        }
        return radio ? 'clicked radio only' : 'not found';
      },
    });
    console.log('[Autopilot BG] Trip type step 2:', tripResult2 && tripResult2[0] && tripResult2[0].result);
    await delay(1000);

    if (route.fillForm) {
      // Return/inbound leg: airports and date are also stale, fill programmatically
      console.log('[Autopilot BG] Step 3: Filling form for', route.org, '→', route.dest, 'on', route.date);
      await fillAirportField(tab.id, '#flightsOriginLocation', route.org);
      await fillAirportField(tab.id, '#flightsOriginDestination', route.dest);
      await fillDateField(tab.id, route.date);
      await delay(500);
    } else {
      // Outbound: airports and date from URL params should be correct
      // (session cache matches the user's search), just need the one-way fix above
      await delay(500);
    }

    // Step 4: Ensure "Book with Aeroplan points" is OFF (search cash fares)
    console.log('[Autopilot BG] Step 4: Ensuring Aeroplan toggle is off...');
    var toggleResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () {
        var toggle = document.querySelector('#bkmg-desktop_searchTypeToggle');
        if (toggle && toggle.checked) {
          toggle.click();
          return 'unchecked';
        }
        return toggle ? 'already off' : 'not found';
      },
    });
    console.log('[Autopilot BG] Toggle result:', toggleResult && toggleResult[0] && toggleResult[0].result);
    await delay(500);

    // Step 5: Click the Search button to trigger the cash fare search
    console.log('[Autopilot BG] Step 5: Clicking Search button...');
    var searchResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () {
        var btn = document.querySelector('#bkmg-desktop_findButton');
        if (btn) {
          btn.click();
          return 'clicked';
        }
        return 'not found';
      },
    });

    // Step 6: Wait for navigation to the results page
    console.log('[Autopilot BG] Step 6: Waiting for results page...');
    await waitForTabComplete(tab.id, 25000);
    // Extra wait for Angular to render flight rows
    await delay(3000);

    var tabInfo = await chrome.tabs.get(tab.id);
    console.log('[Autopilot BG] Tab URL after search:', tabInfo.url);

    // Step 4: Poll for flight rows to appear
    var prices = await waitForFlightRows(tab.id, 30000);
    console.log('[Autopilot BG] Scraping done:', prices.length, 'flights found');
    return prices;
  } catch (err) {
    console.warn('[Autopilot BG] fetchCashPrices failed:', err);
    return [];
  } finally {
    if (tab && tab.id) {
      fetchingTabs.delete(tab.id);
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Poll the tab until flight rows appear, then scrape.
 * Retries every 2s up to maxWait ms.
 */
async function waitForFlightRows(tabId, maxWait) {
  var elapsed = 0;
  var interval = 2000;
  while (elapsed < maxWait) {
    await delay(interval);
    elapsed += interval;
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: scrapeCashPricesFromPage,
      });
      var prices = (results && results[0] && results[0].result) || [];
      if (prices.length > 0) {
        console.log('[Autopilot BG] Found', prices.length, 'cash flights after', elapsed, 'ms');
        return prices;
      }
    } catch (e) {
      // Tab might not be ready yet
    }
  }
  console.warn('[Autopilot BG] No flight rows found after', maxWait, 'ms');
  return [];
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function waitForTabComplete(tabId, timeout) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // resolve even on timeout — page might be partially loaded
    }, timeout);

    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * This function runs IN the cash booking page tab.
 * It scrapes flight rows and extracts cash prices per cabin.
 */
function scrapeCashPricesFromPage() {
  var rows = document.querySelectorAll('.avail-flight-block-row-wrapper, [id^="flight-row-"]');
  var flights = [];
  rows.forEach(function (row) {
    var times = row.querySelectorAll('.bound-time');
    var depTime = times[0] ? times[0].textContent.trim() : null;
    var arrTime = times[1] ? times[1].textContent.trim() : null;
    if (!depTime) return;

    var cabins = row.querySelectorAll('.cabin-container');
    var fares = [];
    var cabinIndex = 0;
    cabins.forEach(function (cabin) {
      var priceEl = cabin.querySelector('.cabin-price [aria-hidden="true"]');
      var price = priceEl ? priceEl.textContent.trim() : null;
      if (!price) { cabinIndex++; return; }

      var cabinType = 'unknown';

      // Method 1: Detect from button class pattern cabin-fare-{idx}-{Y|O|J}
      var button = cabin.querySelector('[class*="button-cell-container"]');
      if (button) {
        var cls = button.className || '';
        var match = cls.match(/cabin-fare-\d+-([A-Z])/);
        if (match) {
          var codes = { Y: 'Economy', O: 'Premium Economy', J: 'Business', F: 'First' };
          cabinType = codes[match[1]] || match[1];
        }
      }

      // Method 2: Detect from aria-label on the button (e.g., "Select Economy seats...")
      if (cabinType === 'unknown' && button) {
        var aria = button.getAttribute('aria-label') || '';
        if (/economy/i.test(aria) && !/premium/i.test(aria)) cabinType = 'Economy';
        else if (/premium\s*economy/i.test(aria)) cabinType = 'Premium Economy';
        else if (/business/i.test(aria)) cabinType = 'Business';
        else if (/first/i.test(aria)) cabinType = 'First';
      }

      // Method 3: Fall back to position-based detection
      // AC typically shows: Economy (0), Premium Economy (1), Business (2)
      if (cabinType === 'unknown') {
        var positionMap = ['Economy', 'Premium Economy', 'Business', 'First'];
        cabinType = positionMap[cabinIndex] || 'Economy';
      }

      fares.push({ cabin: cabinType, price: price });
      cabinIndex++;
    });

    if (fares.length > 0) {
      flights.push({ departure: depTime, arrival: arrTime, fares: fares });
    }
  });
  return flights;
}
