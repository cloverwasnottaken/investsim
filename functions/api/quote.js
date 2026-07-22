/**
 * Cloudflare Pages Function: /api/quote
 * Fetches stock/ETF/futures prices via Yahoo Finance
 * Supports: US stocks, international (LSE: .L suffix), futures (=F suffix)
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get("symbol")?.toUpperCase().trim();

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data = await fetchYahooQuote(symbol);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[quote] ${symbol} error:`, err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Quote fetch failed" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Fetch from Yahoo Finance chart API
 * Returns: { price, prevClose, changePct }
 */
async function fetchYahooQuote(symbol) {
  // Normalize symbol for Yahoo Finance
  let yahooSymbol = symbol;

  // For LSE stocks (e.g., VUAA -> VUAA.L)
  if (symbol.includes(".L")) {
    yahooSymbol = symbol; // already in LSE format
  } else if (!symbol.includes("=")) {
    // If no suffix and not a futures contract, try as-is first (US)
    yahooSymbol = symbol;
  }
  // Futures like GC=F stay as-is

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    yahooSymbol
  )}&fields=regularMarketPrice,regularMarketOpen,regularMarketChange,regularMarketChangePercent,currency`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}`);
  }

  const json = await response.json();

  if (!json.quoteResponse?.result?.length) {
    throw new Error(`symbol not found on Yahoo Finance ("${symbol}")`);
  }

  const quote = json.quoteResponse.result[0];

  // Check for invalid/halted quotes
  if (
    quote.regularMarketPrice === null ||
    quote.regularMarketPrice === undefined
  ) {
    throw new Error(`No price data available for "${symbol}"`);
  }

  return {
    price: quote.regularMarketPrice,
    prevClose: quote.regularMarketOpen || quote.regularMarketPrice,
    changePct: quote.regularMarketChangePercent || 0,
  };
}
