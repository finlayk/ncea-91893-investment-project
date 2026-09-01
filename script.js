// Grab references to the HTML elements this script needs to read or update
const assetSelect = document.getElementById("asset");
const form = document.getElementById("investment-form");
const statusMessage = document.getElementById("status-message");
const resultsCards = document.getElementById("results-cards");
const dataStatusBadge = document.getElementById("data-status-badge");
const resultsDashboard = document.getElementById("results-dashboard");
const calculationAnnouncement = document.getElementById("calculation-announcement");

// This holds the asset data once it has loaded from data.json, initially it starts empty
let assetData = [];

let comparisonDateLabels = getComparisonDates().display; 

const assetDescriptions = {
  bitcoin: "The first and most well-known cryptocurrency, often used as a long-term store of value.",
  ethereum: "A cryptocurrency platform that also supports apps and smart contracts, not just payments.",
  solana: "A newer, faster blockchain often used for apps and trading, with historically higher price swings."
};

let tradingViewReady = false;
const tvScript = document.querySelector('script[src*="tradingview"]');
if (tvScript) {
  tvScript.addEventListener("load", () => {
    tradingViewReady = true;
  });
}


const COINGECKO_BASE = "https://api.coingecko.com/api/v3"; // this is the base URL for the coingecko API, which is used to fetch live prices
const COINGECKO_API_KEY = "CG-u4vWE966sasP9wo5aznopvwL"; // this is a demo API key provided by coingecko for testing purposes, it has rate limits


// This is a reusable calculation. It works out what a past investment would be worth today
function calculatePastValue(amount, priceThen, priceNow) {
  const units = amount / priceThen;           // how many units that $ amount would have bought at that time
  const currentValue = units * priceNow;      // how much those units are worth at today's price
  const percentChange = ((currentValue - amount) / amount) * 100; // percentage gain or loss when compared to the original amount
  return { value: currentValue, percentChange: percentChange };
}


function toCoinGeckoDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}


function formatDisplayDate(date) {
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}


function formatDisplayTime(date) {
  return date.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit"});
}


function getComparisonDates() {
  const now = new Date();

  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);

  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(now.getMonth() - 1);

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  return {
    oneWeekAgo: toCoinGeckoDate(oneWeekAgo),
    oneMonthAgo: toCoinGeckoDate(oneMonthAgo),
    oneYearAgo: toCoinGeckoDate(oneYearAgo),
    display: {
      oneWeekAgo: formatDisplayDate(oneWeekAgo),
      oneMonthAgo: formatDisplayDate(oneMonthAgo),
      oneYearAgo: formatDisplayDate(oneYearAgo)
    }
  };
  }


async function fetchCurrentPrices(coinIds) {
  const url = `${COINGECKO_BASE}/simple/price?ids=${coinIds.join(",")}&vs_currencies=nzd&x_cg_demo_api_key=${COINGECKO_API_KEY}`;  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('CoinGecko current price error: ${response.status}');
  }
  return response.json();
}


async function fetchHistoricalPrice(coinid, dateStr) {
  const url = `${COINGECKO_BASE}/coins/${coinid}/history?date=${dateStr}&x_cg_demo_api_key=${COINGECKO_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('CoinGecko history error: ${response.status}');
  }
  const data = await response.json();
  if (!data.market_data) {
    throw new Error('No historical data for ${coinid} on ${dateStr}');
  }
  return data.market_data.current_price.nzd;
  }
  


async function fetchLiveAssetData(baseAssets) {
  const coinIds = baseAssets.map((asset) => asset.id);
  const dates = getComparisonDates();

  const currentPrices = await fetchCurrentPrices(coinIds);

  const LiveAssets = await Promise.all(
    baseAssets.map(async (asset) => {
      const [priceOneWeekAgo, priceOneMonthAgo, priceOneYearAgo] = await Promise.all([
        fetchHistoricalPrice(asset.id, dates.oneWeekAgo),
        fetchHistoricalPrice(asset.id, dates.oneMonthAgo),
        fetchHistoricalPrice(asset.id, dates.oneYearAgo),
      ]);

      return {
        id: asset.id,
        name: asset.name,
        priceNow: currentPrices[asset.id].nzd,
        priceOneWeekAgo,
        priceOneMonthAgo,
        priceOneYearAgo,
      };
    })
  );

  return LiveAssets;
}

// This is what builds a continuously scrolling ticker (carousel) of all asset prices at the top of the page
function startPriceTicker(assets) {
  const track = document.getElementById("ticker-track");
  if (!track || assets.length === 0) return;

  const itemsHtml = assets
    .map((asset) => `<span class="ticker-item">${asset.name}: $${asset.priceNow.toLocaleString()} NZD</span>`)
    .join("");

  // Duplicate the content so the loop is seamless (scrolls exactly 50% then resets invisibly)
  track.innerHTML = itemsHtml + itemsHtml + itemsHtml;
}

// This fetches the asset data file and fills the dropdown once it's loaded
async function loadAssetData() {
  statusMessage.textContent = "Loading asset data…"; // loading state shown while fetch runs
  try {
    const response = await fetch("data.json");        // request the JSON file
    if (!response.ok) {
      throw new Error("Network response was not OK"); // triggers the catch block below
    }
    const data = await response.json();                // turn the raw response into a usable JS object
    const localAssets = data.assets;                             // store the local asset data for later use

    try {
  assetData = await fetchLiveAssetData(localAssets); // fetch live prices and historical data
  const fetchTime = formatDisplayTime(new Date());
  dataStatusBadge.textContent = `Showing live prices as of ${fetchTime}.`;
  dataStatusBadge.classList.remove("fallback");
  dataStatusBadge.classList.add("live");
} catch (liveError) {
  console.warn("Live price fetch failed, using saved data.json prices instead.", liveError.message);
  assetData = localAssets; // fallback to local data if live fetch fails
  dataStatusBadge.textContent = `Couldn't reach live prices - showing saved data (may not reflect today's prices).`;
  dataStatusBadge.classList.remove("live");
  dataStatusBadge.classList.add("fallback");
}

populateAssetDropdown(assetData);
startPriceTicker(assetData);
statusMessage.textContent = ""; // clear "Loading asset data…" now the badge shows data status separately
  } catch (error) {
    statusMessage.textContent = "Couldn't load asset data. Please try again later."; // error state
    console.error(error); // this logs the actual error to console for debugging
  }
}

function updateAssetDescription() {
  const descriptionElement = document.getElementById("asset-description");
  if (!descriptionElement) return;
  descriptionElement.textContent = assetDescriptions[assetSelect.value] || "";
}

// This builds the <option> elements inside the asset dropdown from the fetched data
function populateAssetDropdown(assets) {
  assetSelect.innerHTML = ""; // clear existing options first
  assets.forEach((asset) => {
    const option = document.createElement("option"); // create one <option> per asset
    option.value = asset.id;
    option.textContent = asset.name;
    assetSelect.appendChild(option); // add it into the <select>
  });
  assetSelect.value = assets[0]?.id || ""; // select the first asset by default, if available
  updateAssetDescription(); // show its description immediately
}

function renderCards(amount, asset) {
  const timeframes = [
    { label: `1 week ago (${comparisonDateLabels.oneWeekAgo})`, priceThen: asset.priceOneWeekAgo },
    { label: `1 month ago (${comparisonDateLabels.oneMonthAgo})`, priceThen: asset.priceOneMonthAgo },
    { label: `1 year ago (${comparisonDateLabels.oneYearAgo})`, priceThen: asset.priceOneYearAgo },
  ];

  resultsCards.innerHTML = ""; // clear old results before showing new ones

  timeframes.forEach((tf) => {
    const result = calculatePastValue(amount, tf.priceThen, asset.priceNow);
    const card = document.createElement("article"); // shows only 1 card per timeframe
    card.className = "card";
    const changeClass = result.percentChange >= 0 ? "positive" : "negative"; // colour coding for gains vs losses
    card.innerHTML = `
      <h3 class="card-title">If invested ${tf.label}</h3>
      <p>$${result.value.toFixed(0)}</p>
      <p class="${changeClass}">${result.percentChange.toFixed(1)}% change</p>
    `;
    resultsCards.appendChild(card);
  });
}

// This draws a bar chart comparing what the investment would be worth after each timeframe
function renderChart(amount, asset) {
  const chartContainer = document.getElementById("results-chart");
  if (!chartContainer) return;

  const bars = [
    { label: "1yr ago", value: calculatePastValue(amount, asset.priceOneYearAgo, asset.priceNow).value },
    { label: "1mo ago", value: calculatePastValue(amount, asset.priceOneMonthAgo, asset.priceNow).value },
    { label: "1wk ago", value: calculatePastValue(amount, asset.priceOneWeekAgo, asset.priceNow).value },
    { label: "Now", value: amount },
  ];

  const maxValue = Math.max(...bars.map((b) => b.value), amount);

  chartContainer.innerHTML = `<p class="chart-heading">If you'd invested $${amount.toLocaleString()} at each point:</p>`;

  const barsWrap = document.createElement("div");
  barsWrap.className = "chart-bars";

  bars.forEach((b) => {
    const heightPercent = (b.value / maxValue) * 100;
    const isNow = b.label === "Now";


    
const wrap = document.createElement("div");
wrap.className = "chart-bar-wrap";
wrap.innerHTML = `
  <span class="chart-bar-value">$${b.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
  <div class="chart-bar ${isNow ? "now" : ""}" style="height: 0%"></div>
  <span class="chart-bar-label">${b.label}</span>
`;
    barsWrap.appendChild(wrap);

    // Set the real height on the next frame so the browser animates from 0% up to the target height
    requestAnimationFrame(() => {
      wrap.querySelector(".chart-bar").style.height = `${heightPercent}%`;
    });
  });

  chartContainer.appendChild(barsWrap);
}

const tradingViewSymbols = {
  bitcoin: "CFI:BTCNZD",
  ethereum: "B2PRIME:ETHNZD",
};
function renderTradingViewChart(amount, asset) {
  const container = document.getElementById("tradingview-chart");

  // Solana has no reliable NZD chart source (no TradingView pair, CoinGecko widget ignores NZD) — use the bar chart instead
  if (asset.id === "solana") {
    renderChart(amount, asset);
    return;
  }

    if (!container || !tradingViewReady || typeof TradingView === "undefined") {
    console.warn("TradingView widget unavailable, falling back to bar chart.");
    renderChart(amount, asset);
    return;
  }

  container.innerHTML = "";

  try {
    new TradingView.widget({
      autosize: true,
      symbol: tradingViewSymbols[asset.id] || "CFI:BTCNZD",
      interval: "D",
      timezone: "Pacific/Auckland",
      theme: "dark",
      style: "1",
      locale: "en",
      container_id: "tradingview-chart",
    });
  } catch (error) {
    console.warn("TradingView widget failed to load, falling back to bar chart.", error);
    renderChart(amount, asset);
  }
}

assetSelect.addEventListener("change", updateAssetDescription); // update description when user selects a different asset

// Runs when the form is submitted
form.addEventListener("submit", (event) => {
  event.preventDefault();

  const amount = Number(document.getElementById("amount").value);
  const selectedId = assetSelect.value;
  const asset = assetData.find((a) => a.id === selectedId);

  if (!asset || !amount || amount <= 0) {
    statusMessage.textContent = "Enter a valid amount and select an asset.";
    return;
  }

  resultsDashboard.classList.remove("hidden"); // reveal results now that we have valid data
  renderCards(amount, asset);
  renderTradingViewChart(amount, asset);
   calculationAnnouncement.textContent = `Results updated for $${amount} invested in ${asset.name}.`;
});




// Kick things off as soon as the script loads, so the dropdown is ready before the user does anything
loadAssetData();