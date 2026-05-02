"use client";
import React, { useState, useMemo } from 'react';
import axios from 'axios';
import * as TI from 'technicalindicators';

export default function BinanceScanner() {
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

      const capMap = new Map();
      mcapRes.data.forEach(c => capMap.set(c.symbol.toUpperCase(), c.market_cap));

      const forceArray = globalFilters.force.split(',').map(s => s.trim().toUpperCase());
      const excludeArray = globalFilters.exclude.split(',').map(s => s.trim().toUpperCase());
      const STABLES = ["USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD", "USDE"];

      const qualified = binanceRes.data.filter(t => {
        const base = t.symbol.replace(/USDT$|USDC$/, "");
        if (!t.symbol.endsWith('USDT') && !t.symbol.endsWith('USDC')) return false;
        if (STABLES.includes(base) || excludeArray.includes(base)) return false;

        const mCap = capMap.get(base) || 0;
        const meets = parseInt(t.count) >= globalFilters.minTrades &&
          parseFloat(t.quoteVolume) >= (globalFilters.minVol * 1000000) &&
          mCap >= (globalFilters.minCap * 1000000);

        return meets || forceArray.includes(base);
      });

      const results = [];
      for (const pair of qualified) {
        setStatus(`Analisando: ${pair.symbol}`);
        const base = pair.symbol.replace(/USDT$|USDC$/, "");
        const mCap = capMap.get(base) || 0;
        let row = {
          symbol: pair.symbol, price: parseFloat(pair.lastPrice),
          vol: parseFloat(pair.quoteVolume), trades: parseInt(pair.count),
          cap: mCap, volCap: (parseFloat(pair.quoteVolume) / mCap) * 100,
          tech: {}
        };

        for (const tf of TIMEFRAMES) {
          const k = await fetchKlines(pair.symbol, tf);
          if (k) {
            const c = k.map(d => d.close), h = k.map(d => d.high), l = k.map(d => d.low), v = k.map(d => d.volume);
            const fmt = (arr) => arr?.slice(-3).reverse().map(v => v.toFixed(2)).join(' | ') || "N/A";

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
          await new Promise(r => setTimeout(r, 40));
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
    const [curr, prev] = parts;
    let color = "text-amber-400";
    if (curr > prev) color = "text-emerald-400 font-bold";
    else if (curr < prev) color = "text-rose-500 font-bold";
    return (
      <div className="flex flex-col leading-tight">
        <span className={color}>{curr.toFixed(2)}</span>
        <span className="text-[9px] text-slate-600 font-mono">{prev.toFixed(2)} | {parts[2].toFixed(2)}</span>
      </div>
    );
  };

  return (
    <main className="p-6 bg-slate-950 min-h-screen text-slate-200 font-sans">
      <div className="max-w-[2200px] mx-auto">
        <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-3xl font-black text-white italic tracking-tighter">BINANCE<span className="text-yellow-500">SCANNER</span></h1>
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-[0.2em]">Crypto Scanner for Binance USDT/USDC pairs with technical indicators</p>
          </div>
          {loading && <div className="text-yellow-500 font-mono text-sm animate-pulse mb-1 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
            </span>
            {status}
          </div>}
        </div>

        {/* Filtros Globais */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 mb-8 bg-slate-900/40 p-6 rounded-3xl border border-white/5 shadow-2xl">
          {Object.keys(globalFilters).map(k => (
            <div key={k}>
              <label className="block text-[10px] uppercase font-black text-slate-500 mb-2">
                {k === 'minVol' ? 'Min Vol (M$)' : k === 'minCap' ? 'Min Cap (M$)' : k === 'exclude' ? 'Excluir Moedas' : k === 'force' ? 'Forçar Moedas' : k}
              </label>
              <input className="w-full bg-slate-800/50 border border-white/5 p-3 rounded-xl text-sm focus:ring-2 focus:ring-yellow-500 outline-none transition-all"
                type={['force', 'exclude'].includes(k) ? 'text' : 'number'} value={globalFilters[k]}
                onChange={e => setGlobalFilters({ ...globalFilters, [k]: e.target.value })} />
            </div>
          ))}
          <button onClick={runScanner} disabled={loading} className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-800 mt-6 rounded-xl font-black text-xs uppercase tracking-widest text-black transition-all active:scale-95">
            {loading ? "SCANNING..." : "RUN SCANNER"}
          </button>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto border border-white/5 rounded-3xl bg-slate-900/20">
          <table className="w-full text-left text-[11px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-900/80">
                <th onClick={() => requestSort('symbol')} className="p-5 sticky left-0 bg-slate-900 z-30 border-r border-white/5 cursor-pointer hover:bg-slate-800 transition-all">
                  SYMBOL {sortConfig.key === 'symbol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <input onClick={e => e.stopPropagation()} placeholder="Search..." className="block mt-2 w-full bg-black/30 border-none p-2 rounded-lg text-[10px] focus:ring-1 focus:ring-yellow-500"
                    onChange={e => setColFilters({ ...colFilters, symbol: e.target.value })} />
                </th>
                <th onClick={() => requestSort('price')} className="p-5 cursor-pointer hover:bg-slate-800 border-b border-white/5">PRICE</th>
                <th onClick={() => requestSort('cap')} className="p-5 cursor-pointer hover:bg-slate-800 border-b border-white/5">MARKET CAP</th>
                <th onClick={() => requestSort('vol')} className="p-5 cursor-pointer hover:bg-slate-800 border-b border-white/5">VOL 24H</th>
                <th onClick={() => requestSort('volCap')} className="p-5 cursor-pointer hover:bg-slate-800 border-b border-white/5">VOL/CAP%</th>
                {INDICATORS.map(ind => TIMEFRAMES.map(tf => (
                  <th key={ind.key + tf} className="p-5 border-l border-white/5 border-b border-white/5 bg-slate-950/30">
                    <div className="flex flex-col">
                      <span className="text-slate-300 font-bold">{ind.label}</span>
                      <span className="text-yellow-500 font-mono text-[9px]">{tf}</span>
                    </div>
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, i) => (
                <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="p-5 sticky left-0 bg-slate-950 group-hover:bg-slate-900 z-20 border-r border-white/5 font-black text-yellow-500 shadow-xl">{row.symbol}</td>
                  <td className="p-5 font-mono text-cyan-400 font-bold border-b border-white/5">{row.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-5 text-slate-300 border-b border-white/5">${(row.cap / 1000000).toFixed(0)}M</td>
                  <td className="p-5 text-slate-300 border-b border-white/5">${(row.vol / 1000000).toFixed(1)}M</td>
                  <td className="p-5 border-b border-white/5">
                    <span className={`px-2 py-1 rounded-md font-bold ${row.volCap > 15 ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'text-slate-500'}`}>
                      {row.volCap.toFixed(1)}%
                    </span>
                  </td>
                  {INDICATORS.map(ind => TIMEFRAMES.map(tf => (
                    <td key={ind.key + tf} className="p-5 border-l border-white/5 border-b border-white/5 whitespace-nowrap">
                      {renderIndicatorCell(row.tech[`${ind.key}_${tf}`])}
                    </td>
                  )))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Rodapé / Legenda */}
        <footer className="mt-8 p-6 bg-slate-900/50 rounded-3xl border border-white/5 text-[10px] text-slate-500">
          <h4 className="text-slate-300 font-bold uppercase mb-4 tracking-widest">Legenda e Parâmetros</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="mb-2"><span className="text-yellow-500 font-bold">CÉLULAS TÉCNICAS:</span></p>
              <ul className="space-y-1">
                <li><span className="text-emerald-400 font-bold">VERDE:</span> Valor atual maior que o anterior (Tendência de Alta)</li>
                <li><span className="text-rose-500 font-bold">VERMELHO:</span> Valor atual menor que o anterior (Tendência de Baixa)</li>
                <li><span className="text-amber-400">AMARELO:</span> Valor atual igual ao anterior (Estabilidade)</li>
                <li className="mt-2 text-slate-400 font-mono">Formato: [Atual] | [Anterior] | [Penúltimo]</li>
              </ul>
            </div>
            <div>
              <p className="mb-2"><span className="text-yellow-500 font-bold">INDICADORES:</span></p>
              <div className="grid grid-cols-2 gap-x-4">
                <span>RSI: Índice de Força Relativa</span>
                <span>MFI: Índice de Fluxo de Dinheiro</span>
                <span>ADX: Índice de Força de Tendência</span>
                <span>ATR: Volatilidade (Average True Range)</span>
                <span>EMA: Médias Móveis Exponenciais</span>
                <span>VSMA: Média Móvel Simples de Volume</span>
              </div>
            </div>
            <div>
              <p className="mb-2"><span className="text-yellow-500 font-bold">NOTAS:</span></p>
              <p className="leading-relaxed">
                Os dados de Market Cap são sincronizados via CoinGecko. O scanner remove automaticamente Stablecoins para evitar poluição visual.
                Utilize o campo "Excluir" para remover ativos indesejados da sua análise.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}