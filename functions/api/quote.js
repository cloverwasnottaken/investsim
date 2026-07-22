
/**
 * Cloudflare Pages Function: /api/quote
 * Hybrid: stockanalysis.com for US, alternatives for LSE + futures
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
    let data;
    
    // Route to appropriate provider
    if (symbol.includes(".L")) {
      // LSE stock - approximate with US equivalent
      data = await fetchLSE(symbol);
    } else if (symbol.includes("=")) {
      // Futures (e.g., GC=F)
      data = await fetchFutures(symbol);
    } else {
      // US stocks/ETFs - use stockanalysis.com
      data = await fetchStockanalysis(symbol);
    }

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

async function fetchStockanalysis(symbol) {
  const url = `https://stockanalysis.com/api/quote/${symbol}/`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();

  if (!json || !json.price) {
    throw new Error(`symbol not found`);
  }

  return {
    price: json.price,
    prevClose: json.prevClose || json.price,
    changePct: (json.change || 0) / (json.prevClose || json.price) * 100,
  };
}

async function fetchLSE(symbol) {
  if (symbol === "VUAA.L") {
    return fetchStockanalysis("VFIAX").catch(() => {
      throw new Error(`LSE symbol ${symbol} not available`);
    });
  }
  throw new Error(`LSE symbol ${symbol} not supported`);
}

async function fetchFutures(symbol) {
  if (symbol === "GC=F") {
    try {
      const response = await fetch("https://api.metals.live/v1/spot/gold");
      if (!response.ok) throw new Error("unavailable");
      
      const json = await response.json();
      const goldPrice = json.price;
      
      if (!goldPrice) throw new Error("no data");

      return {
        price: goldPrice,
        prevClose: goldPrice,
        changePct: 0,
      };
    } catch (err) {
      throw new Error(`Gold futures unavailable`);
    }
  }
  throw new Error(`Futures ${symbol} not supported`);
}
