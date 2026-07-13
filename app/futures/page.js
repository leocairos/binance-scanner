"use client";
import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';

export default function BinanceScannerFutures() {
  const [isClient, setIsClient] = useState(false);
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [globalFilters, setGlobalFilters] = useState({
    minTrades: 30000,
    minVol: 30,
    minCap: 400,
    force: "BTC, ETH, SOL",
    exclude: "USD1, U"
  });

  const [colFilters, setColFilters] = useState({ symbol: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'vol', direction: 'desc' });

  const TIMEFRAMES = ['1h', '4h', '1d', '1w'];

  useEffect(() => { setIsClient(true); }, []);

  const fetchKlines = async (symbol, interval) => {
    try {
      const res = await axios.get(`https://fapi.binance.com/fapi/v1/klines`, {
        params: { symbol, interval, limit: 201 }
      });
      return res.data.map(d => ({
        timestamp: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
      }));
    } catch (e) { return null; }
  };

  const runScanner = async () => {
    setLoading(true);
    setStatus("Buscando dados de mercado...");
    try {
      const binanceRes = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
      let mcapData = [];
      let mcapLoaded = false;

      try {
        const [p1, p2] = await Promise.all([
          axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1'),
          axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2')
        ]);
        mcapData = [...p1.data, ...p2.data];
        mcapLoaded = true;
      } catch (cgError) {
        console.warn("CoinGecko API indisponível. Filtro de Market Cap desativado nesta busca.");
      }

      // Contratos futuros usam prefixos multiplicadores (ex: 1000PEPE, 1000SHIB) que não existem no ticker da CoinGecko.
      const stripMultiplier = (base) => base.replace(/^(1000000|100000|10000|1000)/, "");

      const marketMap = new Map();
      mcapData.forEach(c => {
        const sym = c.symbol.toUpperCase();
        if (!marketMap.has(sym)) marketMap.set(sym, { cap: c.market_cap, rank: c.market_cap_rank });
      });

      const forceArr = globalFilters.force.split(',').map(s => s.trim().toUpperCase());
      const excludeArr = globalFilters.exclude.split(',').map(s => s.trim().toUpperCase());

      const filtered = binanceRes.data.filter(t => {
        const base = t.symbol.replace(/USDT$/, "");
        if (!t.symbol.endsWith('USDT')) return false;
        if (excludeArr.some(ex => base.startsWith(ex)) || ["USDT", "USDC", "FDUSD", "DAI"].includes(base)) return false;

        const info = marketMap.get(stripMultiplier(base)) || { cap: 0 };
        const meetsCriteria = parseInt(t.count) >= globalFilters.minTrades &&
          parseFloat(t.quoteVolume) >= (globalFilters.minVol * 1000000) &&
          (!mcapLoaded || info.cap >= (globalFilters.minCap * 1000000));

        return meetsCriteria || forceArr.includes(base);
      });

      const results = [];
      for (let idx = 0; idx < filtered.length; idx++) {
        const pair = filtered[idx];
        setStatus(`Analisando (${idx + 1}/${filtered.length}): ${pair.symbol}`);

        const base = pair.symbol.replace(/USDT$/, "");
        const info = marketMap.get(stripMultiplier(base)) || { cap: 0, rank: 9999 };
        const vol24h = parseFloat(pair.quoteVolume);

        let row = {
          symbol: pair.symbol,
          price: parseFloat(pair.lastPrice),
          trades: parseInt(pair.count),
          vol: vol24h,
          cap: info.cap,
          rank: info.rank,
          volCap: info.cap > 0 ? (vol24h / info.cap) * 100 : 0,
          klines: {}
        };

        for (const tf of TIMEFRAMES) {
          const k = await fetchKlines(pair.symbol, tf);
          if (k && k.length > 0) row.klines[tf] = k;
        }
        results.push(row);
      }
      setRawData(results);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Erro na sincronização.");
    }
    setLoading(false);
  };

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    let items = rawData.filter(i => i.symbol.toLowerCase().includes(colFilters.symbol.toLowerCase()));
    if (sortConfig.key) {
      items.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [rawData, colFilters, sortConfig]);

  const handleExportJSON = () => {
    if (sortedData.length === 0) return;
    const exportPayload = sortedData.map(item => ({
      symbol: item.symbol,
      rank: item.rank,
      current_price: item.price,
      market_cap: item.cap,
      volume_24h: item.vol,
      trades_24h: item.trades,
      klines_201_periods: item.klines
    }));

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `binance_scanner_export_201c_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  if (!isClient) return <div className="bg-slate-950 min-h-screen" />;

  return (
    <main className="min-h-screen bg-[#0b0e11] text-[#eaecef] font-sans p-6 overflow-x-hidden">
      <div className="max-w-[3600px] mx-auto">

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-white/10 pb-6 gap-4">
          <div>
            <Link href="/" className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-[#f3ba2f] font-bold uppercase tracking-widest mb-3 transition-colors">← Menu</Link>
            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">Binance<span className="text-[#f3ba2f]">Scanner</span> <span className="text-[10px] bg-[#f3ba2f] text-black px-2 py-1 rounded not-italic font-bold ml-2 align-middle">v9.0 FUTURES USDT-M</span></h1>
            <div className="flex items-center gap-4 mt-3">
              <p className="text-slate-400 text-[11px] uppercase font-bold tracking-[0.2em]">High-Performance Futures (USDT-M) Trading Intelligence Dashboard</p>
              <a href="https://github.com/leocairos/binance-scanner" target="_blank" rel="noreferrer" className="text-[10px] bg-slate-800 text-slate-300 px-3 py-1 rounded-md hover:bg-slate-700 transition-all font-mono">github.com/leocairos</a>
            </div>
          </div>
          <div className="text-left md:text-right">
            <div className="text-[11px] text-[#f3ba2f] font-black uppercase mb-1 tracking-widest bg-[#f3ba2f]/10 inline-block px-3 py-1 rounded">Ativos Analisados: {sortedData.length}</div>
            {loading && <div className="text-slate-400 font-mono text-[10px] animate-pulse flex items-center gap-2 uppercase mt-2 justify-start md:justify-end">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span></span>
              {status}
            </div>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-10 bg-[#1e2329] p-6 rounded-2xl border border-white/5 shadow-2xl">
          {Object.keys(globalFilters).map(k => (
            <div key={k} className="col-span-1">
              <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1.5 tracking-widest">{k === 'minVol' ? 'Min Vol (M$)' : k === 'minCap' ? 'Min Cap (M$)' : k === 'exclude' ? 'Excluir Moedas' : k === 'force' ? 'Forçar Moedas' : k}</label>
              <input className="w-full bg-[#0b0e11] border border-white/5 p-2.5 rounded-lg text-sm focus:border-[#f3ba2f] focus:ring-1 focus:ring-[#f3ba2f] outline-none transition-all font-mono text-slate-200"
                type={['force', 'exclude'].includes(k) ? 'text' : 'number'} value={globalFilters[k]}
                onChange={e => setGlobalFilters({ ...globalFilters, [k]: e.target.value })} />
            </div>
          ))}

          <div className="col-span-2 flex flex-col gap-2 justify-end mt-2 md:mt-0">
            <button onClick={runScanner} disabled={loading} className="w-full bg-[#f3ba2f] hover:bg-[#dca326] disabled:bg-slate-800 disabled:text-slate-500 rounded-lg font-black text-xs uppercase tracking-[0.1em] text-black transition-all active:scale-95 py-2.5 flex items-center justify-center">
              {loading ? "PROCESSANDO..." : "INICIAR SCANNER"}
            </button>
            <button onClick={handleExportJSON} disabled={loading || sortedData.length === 0} className="w-full border border-[#f3ba2f]/50 text-[#f3ba2f] hover:bg-[#f3ba2f]/10 disabled:border-slate-800 disabled:text-slate-600 rounded-lg font-black text-xs uppercase tracking-[0.1em] transition-all active:scale-95 py-2.5 flex items-center justify-center">
              ↓ EXPORTAR DADOS (JSON)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-white/5 rounded-2xl bg-[#161a1e] mb-12 shadow-2xl custom-scrollbar">
          <table className="w-full text-left text-[11px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-[#1e2329] backdrop-blur-md">
                <th className="p-4 border-b border-white/5 text-slate-600 sticky left-0 z-50 bg-[#1e2329] min-w-[50px] max-w-[50px]">#</th>
                <th onClick={() => requestSort('rank')} className="p-4 cursor-pointer border-b border-white/5 text-slate-400 text-center sticky left-[50px] z-50 bg-[#1e2329] min-w-[70px] max-w-[70px] hover:bg-white/5 transition-colors">Rank {sortConfig.key === 'rank' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th onClick={() => requestSort('symbol')} className="p-4 sticky left-[120px] bg-[#1e2329] z-50 border-r border-white/5 cursor-pointer hover:bg-white/5 transition-colors min-w-[150px] max-w-[150px] border-b">
                  Symbol {sortConfig.key === 'symbol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <input onClick={e => e.stopPropagation()} placeholder="Filtrar..." className="block mt-1.5 w-full bg-black/50 border-none p-1.5 rounded text-[10px] font-normal focus:ring-1 focus:ring-[#f3ba2f] outline-none text-slate-300"
                    onChange={e => setColFilters({ ...colFilters, symbol: e.target.value })} />
                </th>
                <th onClick={() => requestSort('price')} className="p-4 cursor-pointer border-b border-white/5 sticky left-[270px] z-50 bg-[#1e2329] min-w-[120px] max-w-[120px] border-r border-white/5 text-[#f3ba2f] font-black hover:bg-white/5 transition-colors text-right">Price {sortConfig.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>

                {[
                  { key: 'cap', label: 'Market Cap' },
                  { key: 'trades', label: 'Trades 24h' },
                  { key: 'vol', label: 'Volume 24h' },
                  { key: 'volCap', label: 'Vol/Cap %' }
                ].map(col => (
                  <th key={col.key} onClick={() => requestSort(col.key)} className={`p-4 cursor-pointer border-b border-white/5 text-center min-w-[120px] hover:bg-white/5 transition-colors uppercase ${col.key === 'volCap' ? 'text-orange-400 font-black' : 'text-slate-300'}`}>
                    {col.label} {sortConfig.key === col.key && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, i) => (
                <tr key={i} className="group hover:bg-white/[0.03] transition-colors border-b border-white/5 last:border-0">
                  <td className="p-4 text-slate-600 font-mono sticky left-0 z-30 bg-[#161a1e] group-hover:bg-[#1e2329] min-w-[50px] border-b border-white/5">{i + 1}</td>
                  <td className="p-4 text-center sticky left-[50px] z-30 bg-[#161a1e] group-hover:bg-[#1e2329] text-slate-500 font-bold min-w-[70px] border-b border-white/5">#{row.rank}</td>
                  <td className="p-4 sticky left-[120px] bg-[#161a1e] group-hover:bg-[#1e2329] z-30 border-r border-b border-white/5 min-w-[150px]">
                    <a href={`https://www.tradingview.com/chart/?symbol=BINANCE:${row.symbol}.P`} target="_blank" rel="noopener noreferrer" className="font-black text-[#f3ba2f] hover:text-white flex flex-col group-hover:underline underline-offset-4 decoration-2">
                      {row.symbol} <span className="text-[7px] font-normal text-slate-500 mt-0.5 uppercase italic tracking-widest">TradingView ↗</span>
                    </a>
                  </td>
                  <td className="p-4 font-mono text-cyan-400 font-bold sticky left-[270px] z-30 bg-[#161a1e] group-hover:bg-[#1e2329] border-r border-b border-white/5 text-right min-w-[120px]">
                    {row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                  </td>

                  <td className="p-4 text-slate-400 border-b border-white/5 text-center font-mono">${(row.cap / 1000000).toFixed(0)}M</td>
                  <td className="p-4 text-slate-400 border-b border-white/5 text-center font-mono">{row.trades.toLocaleString()}</td>
                  <td className="p-4 text-slate-300 border-b border-white/5 text-center font-mono">${(row.vol / 1000000).toFixed(1)}M</td>
                  <td className="p-4 border-b border-white/5 text-center font-black font-mono">
                    <span className={`px-2 py-1 rounded text-[10px] ${row.volCap > 15 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' : 'text-slate-600'}`}>{row.volCap.toFixed(2)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="p-8 bg-[#1e2329] rounded-3xl border border-white/5 text-[10px] text-slate-400 shadow-2xl mb-12">
          <h4 className="text-white font-black uppercase mb-6 tracking-[0.3em] border-b border-white/10 pb-4 flex items-center gap-2">
            <span className="text-[#f3ba2f]">///</span> Guia de Operação e Legendas
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <h5 className="text-[#f3ba2f] font-bold uppercase tracking-widest mb-3">Lógica e Exportação</h5>
              <p className="leading-relaxed mb-4 text-slate-400">O botão <span className="text-[#f3ba2f] font-bold">EXPORTAR DADOS</span> permite baixar o histórico bruto de 201 candles em todos os timeframes testados (1h, 4h, 1d, 1w). Ideal para machine learning.</p>
              <div className="grid grid-cols-2 gap-2 text-slate-500 font-bold uppercase text-[9px]">
                <div className="bg-black/20 p-2 rounded border-l-2 border-[#f3ba2f]">Market Cap: Tamanho do Ativo</div>
                <div className="bg-black/20 p-2 rounded border-l-2 border-[#f3ba2f]">Vol/Cap: Liquidez</div>
              </div>
            </div>

            <div className="flex flex-col justify-between">
              <div>
                <h5 className="text-[#f3ba2f] font-bold uppercase tracking-widest mb-3">Informações de API</h5>
                <p className="leading-relaxed font-medium">Os dados de Preço, Volume e Klines são fornecidos nativamente pela <strong>Binance Futures API (USDT-M, produção)</strong>. A capitalização de mercado e o Ranking Global são sincronizados via <strong>CoinGecko</strong>.</p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10 text-slate-600 font-black tracking-widest uppercase flex justify-between">
                <span>Binance Scanner PRO</span>
                <span>v9.0 Futures USDT-M Build</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
