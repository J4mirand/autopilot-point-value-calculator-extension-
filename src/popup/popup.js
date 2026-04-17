/**
 * Autopilot — Popup Logic
 *
 * Shows top 5 deals when flight data is available,
 * otherwise displays the welcome/instructions page.
 */
(function () {
  'use strict';

  // Open external links in new tabs (Chrome popup can't navigate directly)
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (link && link.href && link.href.startsWith('http')) {
      e.preventDefault();
      chrome.tabs.create({ url: link.href });
    }
  });

  // ---- DOM refs ----
  var welcomeSection = document.getElementById('welcome-section');
  var dealsSection = document.getElementById('deals-section');
  var dealsSubtitle = document.getElementById('deals-subtitle');
  var dealsList = document.getElementById('deals-list');

  // ---- Helpers ----

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  function fmtSavings(n) {
    return Math.round(Math.abs(n || 0)).toLocaleString();
  }

  function fmtCash(n) {
    return Math.round(n || 0).toLocaleString();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    // Parse as local date parts to avoid UTC timezone shift
    var parts = String(dateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (parts) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(parts[2], 10) - 1] + ' ' + parseInt(parts[3], 10) + ', ' + parts[1];
    }
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return escapeHtml(dateStr);
    var months2 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months2[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  // ---- Render deals ----

  function renderDeals(flights) {
    if (!flights || flights.length === 0) {
      welcomeSection.style.display = '';
      dealsSection.style.display = 'none';
      return;
    }

    // Sort by CPP descending, take top 5
    flights.sort(function (a, b) { return (b.cpp || 0) - (a.cpp || 0); });
    var top5 = flights.slice(0, 5);

    welcomeSection.style.display = 'none';
    dealsSection.style.display = '';
    dealsSubtitle.textContent = 'Showing top ' + top5.length + ' of ' + flights.length + ' flights analyzed';

    // Route header — use first flight's route and departure date
    var firstFlight = top5[0];
    var routeText = escapeHtml(firstFlight.origin || '') + ' \u2192 ' + escapeHtml(firstFlight.destination || '');
    var dateText = formatDate(firstFlight.date);

    var html = '';

    // Route + date header
    html += '<div class="deals-route-header">'
      + '<span class="deals-route-header__route">' + routeText + '</span>'
      + (dateText ? '<span class="deals-route-header__date">' + dateText + '</span>' : '')
      + '</div>';

    // Re-assign ratings for the popup's sorted order:
    // The #1 deal (highest CPP) should always be gold/max if it meets benchmark.
    // Stored ratings may be stale if pipeline ran in multiple batches.
    var benchmarkCpp = top5[0].currency === 'USD' ? 1.6 : 2.1;
    for (var k = 0; k < top5.length; k++) {
      var displayCpp = Math.round((top5[k].cpp || 0) * 10) / 10;
      if (k === 0 && displayCpp >= benchmarkCpp) {
        top5[k].rating = 'max';
      } else if (displayCpp >= benchmarkCpp) {
        top5[k].rating = 'good';
      } else {
        top5[k].rating = 'bad';
      }
    }

    // Deal cards
    for (var i = 0; i < top5.length; i++) {
      var f = top5[i];
      var rating = f.rating || 'bad';
      var cppDisplay = Number(f.cpp || 0).toFixed(1);
      var cardClass = 'deal-card deal-card--' + rating;
      var cppClass = 'deal-card__cpp deal-card__cpp--' + rating;
      var savingsClass = 'deal-card__savings deal-card__savings--' + rating;

      var depTime = escapeHtml(f.departureTime || '');
      var arrTime = escapeHtml(f.arrivalTime || '');
      var stops = escapeHtml(f.stops || 'Nonstop');
      var cabin = escapeHtml(f.seatClassLabel || 'Economy');
      var currSign = f.currency === 'USD' ? 'US$' : '$';

      // Time display
      var timeDisplay = '';
      if (depTime && arrTime) {
        timeDisplay = depTime + ' - ' + arrTime;
      } else if (depTime) {
        timeDisplay = depTime;
      }

      // Savings text — good/max says "with points", bad says "with cash"
      var savings = f.cashSavings || 0;
      var savingsText = '';
      if (rating === 'bad') {
        savingsText = 'Save ' + currSign + fmtSavings(savings) + ' with cash';
      } else {
        savingsText = 'Save ' + currSign + fmtSavings(savings) + ' with points';
      }

      // Cash price
      var cashText = '';
      if (f.cashPrice) {
        cashText = currSign + fmtCash(f.cashPrice);
      }

      // Time + stops combined
      var timeStopsDisplay = timeDisplay;
      if (timeDisplay && stops) {
        timeStopsDisplay = timeDisplay + ' · ' + stops;
      } else if (stops) {
        timeStopsDisplay = stops;
      }

      // Cash price with label: "$485 (Cash Price CAD)"
      var currLabel = f.currency === 'USD' ? 'USD' : 'CAD';
      var cashLabelText = '';
      if (f.cashPrice) {
        cashLabelText = currSign + fmtCash(f.cashPrice) + ' <span class="deal-card__price-label">(Cash Price ' + currLabel + ')</span>';
      }

      // Point price display
      var pointsText = '';
      if (f.pointPrice) {
        var pointsFormatted = f.pointPrice >= 1000
          ? (f.pointPrice / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
          : fmtCash(f.pointPrice);
        pointsText = pointsFormatted + ' <span class="deal-card__price-label">pts</span>';
      }

      html += '<div class="' + cardClass + '">'
        // Row 1: times + stops + CPP badge
        + '<div class="deal-card__row1">'
        +   '<span class="deal-card__times">' + timeStopsDisplay + '</span>'
        +   '<span class="' + cppClass + '">' + cppDisplay + ' CPP</span>'
        + '</div>'
        // Row 2: cabin + cash price (Cash Price CAD)
        + '<div class="deal-card__row2">'
        +   '<span class="deal-card__label">' + cabin + '</span>'
        +   (cashLabelText ? '<span class="deal-card__cash">' + cashLabelText + '</span>' : '')
        + '</div>'
        // Row 3: point price
        + (pointsText ? '<div class="deal-card__row2"><span class="deal-card__label">Points</span><span class="deal-card__points">' + pointsText + '</span></div>' : '')
        // Row 4: savings
        + '<div class="deal-card__row3">'
        +   '<span class="' + savingsClass + '">' + savingsText + '</span>'
        + '</div>'
        + '</div>';
    }

    dealsList.innerHTML = html;
  }

  // ---- Fetch and listen ----

  function getActiveTabId(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      callback(tabs && tabs[0] ? tabs[0].id : null);
    });
  }

  function fetchAndRender() {
    getActiveTabId(function (tabId) {
      if (!tabId) {
        renderDeals([]);
        return;
      }
      chrome.runtime.sendMessage({ action: 'getFlights', tabId: tabId }, function (flights) {
        renderDeals(flights || []);
      });
    });
  }

  // Initial load
  fetchAndRender();

  // Listen for real-time updates from content script
  chrome.runtime.onMessage.addListener(function (message) {
    if (message && message.action === 'flightsUpdated') {
      // Only re-render if the update is for the active tab
      getActiveTabId(function (tabId) {
        if (tabId && message.tabId === tabId) {
          fetchAndRender();
        }
      });
    }
  });
})();
