// Grab references to the HTML elements this script needs to read or update
const assetSelect = document.getElementById("asset");
const form = document.getElementById("investment-form");
const statusMessage = document.getElementById("status-message");
const resultsCards = document.getElementById("results-cards");

// This holds the asset data once it has loaded from data.json, it starts empty
let assetData = [];

// Reusable calculation. This works out what a past investment would be worth today
function calculatePastValue(amount, priceThen, priceNow) {
  const units = amount / priceThen;           // how many "units" that $ amount would have bought at that time
  const currentValue = units * priceNow;      // how much those units are worth at today's price
  const percentChange = ((currentValue - amount) / amount) * 100; // percentage gain / loss when compared to original amount
  return { value: currentValue, percentChange: percentChange };
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
    assetData = data.assets;                            // store it for later use
    populateAssetDropdown(assetData);                   // build the dropdown options now data exists
    statusMessage.textContent = "";                      // clear the loading message
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