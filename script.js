// Grab references to the HTML elements this script needs to read or update
const assetSelect = document.getElementById("asset");
const form = document.getElementById("investment-form");
const statusMessage = document.getElementById("status-message");
const resultsCards = document.getElementById("results-cards");

// This holds the asset data once it has loaded from data.json, it starts empty
let assetData = [];

const COINGECKO_BASE = "https://api.coingecko.com/api/v3"; // this is the base URL for the CoinGecko API, which we will use to fetch live prices
const COINGECKO_API_KEY = "CG-u4vWE966sasP9wo5aznopvwL"; // this is a demo API key provided by CoinGecko for testing purposes, it has rate limits


// Reusable calculation. This works out what a past investment would be worth today
function calculatePastValue(amount, priceThen, priceNow) {
  const units = amount / priceThen;           // how many "units" that $ amount would have bought at that time
  const currentValue = units * priceNow;      // how much those units are worth at today's price
  const percentChange = ((currentValue - amount) / amount) * 100; // percentage gain / loss when compared to original amount
  return { value: currentValue, percentChange: percentChange };
}


function toCoinGeckoDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
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
  };
  }


async function fetchCurrentPrices(coinIds) {
  const url = `${COINGECKO_BASE}/simple/price?ids=${coinIds.join(",")}&vs_currencies=usd&x_cg_demo_api_key=${COINGECKO_API_KEY}`;
  const response = await fetch(url);
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
  return data.market_data.current_price.usd;
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
        priceNow: currentPrices[asset.id].usd,
        priceOneWeekAgo,
        priceOneMonthAgo,
        priceOneYearAgo,
      };
    })
  );

  return LiveAssets;
}



// Fetches the asset data file and fills the dropdown once it's loaded
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
      statusMessage.textContent = "Showing live prices."; // show that live data is being used
    } catch (liveError) {
      console.warn("Live price fetch failed, using saved data.json prices instead.", liveError.message);
      assetData = localAssets; // fallback to local data if live fetch fails
      statusMessage.textContent = "Couldn't reach live prices - showing saved data instead.";
    }


    populateAssetDropdown(assetData);                   // build the dropdown options now data exists
  } catch (error) {
    statusMessage.textContent = "Couldn't load asset data. Please try again later."; // error state
    console.error(error); // this logs the actual error to console for debugging
  }
}

// Builds the <option> elements inside the asset dropdown from the fetched data
function populateAssetDropdown(assets) {
  assetSelect.innerHTML = ""; // clear existing options first
  assets.forEach((asset) => {
    const option = document.createElement("option"); // create one <option> per asset
    option.value = asset.id;
    option.textContent = asset.name;
    assetSelect.appendChild(option); // add it into the <select>
  });
}

// Builds and displays the three result cards (1 week / 1 month / 1 year)
function renderCards(amount, asset) {
  const timeframes = [
    { label: "1 week ago", priceThen: asset.priceOneWeekAgo },
    { label: "1 month ago", priceThen: asset.priceOneMonthAgo },
    { label: "1 year ago", priceThen: asset.priceOneYearAgo }
  ];

  resultsCards.innerHTML = ""; // clear old results before showing new ones

  timeframes.forEach((tf) => {
    const result = calculatePastValue(amount, tf.priceThen, asset.priceNow);
    const card = document.createElement("article"); // one card per timeframe
    card.className = "card";
    const changeClass = result.percentChange >= 0 ? "positive" : "negative"; // colour coding for gain/loss
    card.innerHTML = `
      <h3 class="card-title">If invested ${tf.label}</h3>
      <p>$${result.value.toFixed(0)}</p>
      <p class="${changeClass}">${result.percentChange.toFixed(1)}% change</p>
    `;
    resultsCards.appendChild(card);
  });
}

// Runs when the form is submitted
form.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the page from refreshing (default form behaviour)

  const amount = Number(document.getElementById("amount").value); // read the typed amount
  const selectedId = assetSelect.value;                             // read the chosen asset id
  const asset = assetData.find((a) => a.id === selectedId);         // find the matching asset object

  if (!asset || !amount || amount <= 0) {
    statusMessage.textContent = "Enter a valid amount and select an asset."; // basic validation
    return;
  }

  renderCards(amount, asset); // show the results
});

// Kick things off as soon as the script loads, so the dropdown is ready before the user does anything
loadAssetData();