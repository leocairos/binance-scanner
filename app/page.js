"use client";
import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import * as TI from 'technicalindicators';

export default function BinanceScanner() {
  const [isClient, setIsClient] = useState(false);
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [globalFilters, setGlobalFilters] = useState({
    minTrades: 30000,
    minVol: 30,
    minCap: 400,
    force: "BNB, SOL",
    exclude: "XRP, ADA"
  });

  const [colFilters, setColFilters] = useState({ symbol: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'cap', direction: 'desc' });

  const TIMEFRAMES = ['1h', '4h', '1d', '1w'];
  const INDICATORS = [
    { label: 'RSI', key: 'RSI' }, { label: 'MFI', key: 'MFI' },
    { label: 'ADX', key: 'ADX' }, { label: 'ATR', key: 'ATR' },
    { label: 'EMA7', key: 'E7' }, { label: 'EMA21', key: 'E21' },
    { label: 'EMA50', key: 'E50' }, { label: 'EMA100', key: 'E100' },
    { label: 'VSMA20', key: 'V_SMA' }
  ];

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchKlines = async (symbol, interval) => {
    try {
      const res = await axios.get(`https://api.binance.com/api/v3/klines`, {
        params: { symbol, interval, limit: 150 }
      });
      return res.data.map(d => ({
        high: parseFloat(d[2]), low: parseFloat(d[3]),
        close: parseFloat(d[4]), volume: parseFloat(d[5])
      }));
    } catch (e) { return null; }
  };

  const runScanner = async () => {
    setLoading(true);
    setStatus("Sincronizando APIs...");
    try {
      const [binanceRes, mcapRes] = await Promise.all([
        axios.get('https://api.binance.com/api/v3/ticker/24hr'),
        axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250')
      ]);

      // Mapeamento de Market Cap e Ranking do CoinGecko
      const marketInfoMap = new Map();
      mcapRes.data.forEach(c => {
        marketInfoMap.set(c.symbol.toUpperCase(), {
          cap: c.market_cap,
          rank: c.market_cap_rank
        });
      });

      const forceArray = globalFilters.force.split(',').map(s => s.trim().toUpperCase());
      const excludeArray = globalFilters.exclude.split(',').map(s => s.trim().toUpperCase());
      const STABLES = ["USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD", "USDE"];

      const qualified = binanceRes.data.filter(t => {
        const base = t.symbol.replace(/USDT$|USDC$/, "");
        if (!t.symbol.endsWith('USDT') && !t.symbol.endsWith('USDC')) return false;
        if (STABLES.includes(base) || excludeArray.includes(base)) return false;

        const info = marketInfoMap.get(base) || { cap: 0, rank: 'N/A' };
        const meets = parseInt(t.count) >= globalFilters.minTrades &&
          parseFloat(t.quoteVolume) >= (globalFilters.minVol * 1000000) &&
          info.cap >= (globalFilters.minCap * 1000000);

        return meets || forceArray.includes(base);
      });

      const results = [];
      for (const pair of qualified) {
        setStatus(`Analisando: ${pair.symbol}`);
        const base = pair.symbol.replace(/USDT$|USDC$/, "");
        const info = marketInfoMap.get(base) || { cap: 0, rank: '?' };
        const vol24h = parseFloat(pair.quoteVolume);

        let row = {
          symbol: pair.symbol,
          price: parseFloat(pair.lastPrice),
          vol: vol24h,
          trades: parseInt(pair.count),
          cap: info.cap,
          rank: info.rank,
          volCap: info.cap > 0 ? (vol24h / info.cap) * 100 : 0,
          tech: {}
        };

        for (const tf of TIMEFRAMES) {
          const k = await fetchKlines(pair.symbol, tf);
          if (k) {
            const c = k.map(d => d.close), h = k.map(d => d.high), l = k.map(d => d.low), v = k.map(d => d.volume);
            const fmt = (arr) => {
              if (!arr || arr.length < 2) return "N/A";
              return arr.slice(-3).reverse().map(v => (v !== undefined && v !== null) ? v.toFixed(2) : "0.00").join(' | ');
            };
            row.tech[`RSI_${tf}`] = fmt(TI.RSI.calculate({ values: c, period: 14 }));
            row.tech[`MFI_${tf}`] = fmt(TI.MFI.calculate({ high: h, low: l, close: c, volume: v, period: 14 }));
            row.tech[`ADX_${tf}`] = fmt(TI.ADX.calculate({ high: h, low: l, close: c, period: 14 }).map(x => x.adx));
            row.tech[`ATR_${tf}`] = fmt(TI.ATR.calculate({ high: h, low: l, close: c, period: 14 }));
            row.tech[`E7_${tf}`] = fmt(TI.EMA.calculate({ values: c, period: 7 }));
            row.tech[`E21_${tf}`] = fmt(TI.EMA.calculate({ values: c, period: 21 }));
            row.tech[`E50_${tf}`] = fmt(TI.EMA.calculate({ values: c, period: 50 }));
            row.tech[`E100_${tf}`] = fmt(TI.EMA.calculate({ values: c, period: 100 }));
            row.tech[`V_SMA_${tf}`] = fmt(TI.SMA.calculate({ values: v, period: 20 }));
          }
        }
        results.push(row);
      }
      setRawData(results);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const filteredAndSortedData = useMemo(() => {
    let sortableData = [...rawData];
    if (colFilters.symbol) {
      sortableData = sortableData.filter(i => i.symbol.toLowerCase().includes(colFilters.symbol.toLowerCase()));
    }
    sortableData.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableData;
  }, [rawData, colFilters, sortConfig]);

  const requestSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };

  const renderIndicatorCell = (valString) => {
    if (!valString || valString === "N/A") return <span className="text-slate-600">N/A</span>;
    const parts = valString.split(' | ').map(v => parseFloat(v));
    const curr = parts[0]; const prev = parts[1];
    if (isNaN(curr) || isNaN(prev)) return <span className="text-slate-600">N/A</span>;
    let color = "text-amber-400";
    if (curr > prev) color = "text-emerald-400 font-bold";
    else if (curr < prev) color = "text-rose-500 font-bold";
    return (
      <div className="flex flex-col leading-tight">
        <span className={color}>{curr.toFixed(2)}</span>
        <span className="text-[9px] text-slate-600 font-mono">{prev.toFixed(2)} | {(parts[2] || 0).toFixed(2)}</span>
      </div>
    );
  };

  if (!isClient) return <div className="bg-slate-950 min-h-screen" />;

  return (
    <main className="p-6 bg-slate-950 min-h-screen text-slate-200 font-sans">
      <div className="max-w-[2400px] mx-auto">
        <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-3xl font-black text-white italic tracking-tighter">BINANCE<span className="text-yellow-500">SCANNER</span></h1>
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-[0.2em]">Crypto Scanner for Binance USDT/USDC pairs with technical indicators</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Total Listados: {filteredAndSortedData.length}</div>
            {loading && <div className="text-yellow-500 font-mono text-sm animate-pulse flex items-center gap-2">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span></span>
              {status}
            </div>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 mb-8 bg-slate-900/40 p-6 rounded-3xl border border-white/5 shadow-2xl">
          {Object.keys(globalFilters).map(k => (
            <div key={k}>
              <label className="block text-[10px] uppercase font-black text-slate-500 mb-2">{k === 'minVol' ? 'Min Vol (M$)' : k === 'minCap' ? 'Min Cap (M$)' : k === 'exclude' ? 'Excluir Moedas' : k === 'force' ? 'Forçar Moedas' : k}</label>
              <input className="w-full bg-slate-800/50 border border-white/5 p-3 rounded-xl text-sm focus:ring-2 focus:ring-yellow-500 outline-none transition-all"
                type={['force', 'exclude'].includes(k) ? 'text' : 'number'} value={globalFilters[k]}
                onChange={e => setGlobalFilters({ ...globalFilters, [k]: e.target.value })} />
            </div>
          ))}
          <button onClick={runScanner} disabled={loading} className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-800 mt-6 rounded-xl font-black text-xs uppercase tracking-widest text-black transition-all active:scale-95">
            {loading ? "SCANNING..." : "RUN SCANNER"}
          </button>
        </div>

        <div className="overflow-x-auto border border-white/5 rounded-3xl bg-slate-900/20 shadow-inner">
          <table className="w-full text-left text-[11px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-900/80">
                <th className="p-4 border-b border-white/5 text-slate-500">#</th>
                <th onClick={() => requestSort('rank')} className="p-4 cursor-pointer hover:bg-slate-800 border-b border-white/5 text-slate-500">RANK</th>
                <th onClick={() => requestSort('symbol')} className="p-5 sticky left-0 bg-slate-900 z-30 border-r border-white/5 cursor-pointer hover:bg-slate-800 transition-all">
                  SYMBOL {sortConfig.key === 'symbol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <input onClick={e => e.stopPropagation()} placeholder="Search..." className="block mt-2 w-full bg-black/30 border-none p-2 rounded-lg text-[10px] focus:ring-1 focus:ring-yellow-500"
                    onChange={e => setColFilters({ ...colFilters, symbol: e.target.value })} />
                </th>
                <th onClick={() => requestSort('price')} className="p-5 cursor-pointer hover:bg-slate-800 border-b border-white/5">PRICE</th>
                <th onClick={() => requestSort('cap')} className="p-5 cursor-pointer hover:bg-slate-800 border-b border-white/5 text-center">MARKET CAP</th>
                <th onClick={() => requestSort('vol')} className="p-5 cursor-pointer hover:bg-slate-800 border-b border-white/5 text-center">VOL 24H</th>
                <th onClick={() => requestSort('volCap')} className="p-5 cursor-pointer hover:bg-slate-800 border-b border-white/5 text-center">VOL/CAP%</th>
                {INDICATORS.map(ind => TIMEFRAMES.map(tf => (
                  <th key={ind.key + tf} className="p-5 border-l border-white/5 border-b border-white/5 bg-slate-950/30">
                    <div className="flex flex-col"><span className="text-slate-300 font-bold">{ind.label}</span><span className="text-yellow-500 font-mono text-[9px]">{tf}</span></div>
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, i) => (
                <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-slate-600 font-mono border-b border-white/5">{i + 1}</td>
                  <td className="p-4 border-b border-white/5"><span className="bg-slate-800 px-2 py-0.5 rounded text-slate-400 text-[10px]">#{row.rank}</span></td>
                  <td className="p-5 sticky left-0 bg-slate-950 group-hover:bg-slate-900 z-20 border-r border-white/5 font-black text-yellow-500 shadow-xl">{row.symbol}</td>
                  <td className="p-5 font-mono text-cyan-400 font-bold border-b border-white/5">{row.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-5 text-slate-300 border-b border-white/5 text-center">${(row.cap / 1000000).toFixed(0)}M</td>
                  <td className="p-5 text-slate-300 border-b border-white/5 text-center">${(row.vol / 1000000).toFixed(1)}M</td>
                  <td className="p-5 border-b border-white/5 text-center">
                    <span className={`px-2 py-1 rounded-md font-bold ${row.volCap > 15 ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'text-slate-500'}`}>{row.volCap.toFixed(1)}%</span>
                  </td>
                  {INDICATORS.map(ind => TIMEFRAMES.map(tf => (
                    <td key={ind.key + tf} className="p-5 border-l border-white/5 border-b border-white/5 whitespace-nowrap text-center">{renderIndicatorCell(row.tech[`${ind.key}_${tf}`])}</td>
                  )))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="mt-8 p-6 bg-slate-900/50 rounded-3xl border border-white/5 text-[10px] text-slate-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="mb-2"><span className="text-yellow-500 font-bold uppercase">Legenda:</span></p>
              <ul className="space-y-1">
                <li><span className="text-emerald-400 font-bold">VERDE:</span> Valor atual &gt; anterior</li>
                <li><span className="text-rose-500 font-bold">VERMELHO:</span> Valor atual &lt; anterior</li>
                <li><span className="text-amber-400">AMARELO:</span> Sem alteração significativa</li>
              </ul>
            </div>
            <div className="text-center self-center">
              <p className="font-bold text-slate-400 uppercase tracking-widest">Binance Technical Scanner v2.5</p>
              <p className="mt-1">Powered by Binance & CoinGecko APIs</p>
            </div>
            <div className="text-right">
              <p className="mb-2"><span className="text-yellow-500 font-bold uppercase">Notas:</span></p>
              <p>O ranking (#) reflete a posição da moeda base no CoinGecko por Capitalização de Mercado.</p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}