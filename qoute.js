// Cloudflare Pages Function.
// Since this project is already deployed on Cloudflare Pages, this file just
// needs to sit at functions/api/quote.js in the repo — Pages auto-detects it
// and serves it at /api/quote, no config, no signup, no key.
//
// Why this exists: fetching Yahoo/Stooq directly from the browser needs a
// third-party CORS proxy (allorigins, codetabs, jina-reader, corsproxy.io),
// and all of those are unreliable — rate-limited, sometimes down, sometimes
// blocked by the target site. A server-to-server fetch from Cloudflare's edge
// has no CORS restriction at all (that's a browser-only concept) and can send
// real headers, so it's far more likely to actually get data back.

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");

  if (!symbol) {
    return json({ error: "missing ?symbol=" }, 400);
  }

  try {
    const data = await fetchYahoo(symbol);
    return json(data, 200, { "Cache-Control": "public, max-age=20" });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function fetchYahoo(symbol) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(yahooUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*",
    },
  });

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();

  const err = data?.chart?.error;
  if (err) throw new Error(err.description || err.code || "Yahoo returned an error");

  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) throw new Error("unexpected response shape from Yahoo");

  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  if (!isFinite(price) || price <= 0) throw new Error(`no price for "${symbol}"`);

  const changePct = isFinite(prevClose) && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

  return {
    symbol,
    price,
    prevClose: prevClose ?? null,
    changePct,
    currency: meta.currency || null,
  };
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
