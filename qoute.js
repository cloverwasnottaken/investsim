// Cloudflare Pages Function.
// Since this project is already deployed on Cloudflare Pages, this file just
// needs to sit at functions/api/quote.js in the repo — Pages auto-detects it
// and serves it at /api/quote, no config, no signup, no key.
//
// Data source: stockanalysis.com's own internal quotes API (the same one
// their site's price widgets poll). It's undocumented but public and doesn't
// require a key. Fetched server-to-server here, so there's no browser CORS
// restriction and no dependency on flaky third-party CORS-proxy services.

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");

  if (!symbol) {
    return json({ error: "missing ?symbol=" }, 400);
  }

  try {
    const data = await fetchStockAnalysis(symbol);
    return json(data, 200, { "Cache-Control": "public, max-age=20" });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function fetchStockAnalysis(symbol) {
  const lower = symbol.toLowerCase();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
  };

  // Stocks use the /s/ prefix, ETFs use /e/ — try both since we don't know
  // which one a given ticker is (VUAA is an ETF, AAPL is a stock, etc).
  const attempts = [];
  for (const kind of ["s", "e"]) {
    const apiUrl = `https://stockanalysis.com/api/quotes/${kind}/${encodeURIComponent(lower)}`;
    try {
      const res = await fetch(apiUrl, { headers });
      if (!res.ok) { attempts.push(`${kind}: HTTP ${res.status}`); continue; }
      const body = await res.json();
      if (body?.status !== 200 || !body?.data) { attempts.push(`${kind}: no data in response`); continue; }

      const d = body.data;
      const price = d.p;
      const prevClose = isFinite(d.cl) ? d.cl : (isFinite(d.p) && isFinite(d.c) ? d.p - d.c : null);
      if (!isFinite(price) || price <= 0) { attempts.push(`${kind}: invalid price`); continue; }

      const changePct = isFinite(d.cp) ? d.cp
        : (prevClose && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0);

      return {
        symbol: d.symbol || symbol.toUpperCase(),
        price,
        prevClose,
        changePct,
      };
    } catch (e) {
      attempts.push(`${kind}: ${e.message}`);
    }
  }

  throw new Error(`symbol not found on stockanalysis.com ("${symbol}") — ${attempts.join("; ")}`);
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}
