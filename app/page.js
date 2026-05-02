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
    force: "BTC, ETH, SOL",
    exclude: "USD1, U"
  });

  const [colFilters, setColFilters] = useState({ symbol: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'vol', direction: 'desc' });

  const TIMEFRAMES = ['1h', '4h', '1d', '1w'];
  const INDICATORS = [
    { label: 'RSI', key: 'RSI' }, { label: 'MFI', key: 'MFI' },
    { label: 'ADX', key: 'ADX' }, { label: 'EMA7', key: 'E7' },
    { label: 'EMA21', key: 'E21' }, { label: 'EMA50', key: 'E50' },
    { label: 'EMA100', key: 'E100' }, { label: 'VSMA20', key: 'V_SMA' }
  ];

  useEffect(() => { setIsClient(true); }, []);

  const fetchKlines = async (symbol, interval) => {
    try {
      const res = await axios.get(`https://api.binance.com/api/v3/klines`, {
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

  const getMTFSignal = (tech) => {
    const analysis = [];
    const scores = { buy: 0, sell: 0 };

    TIMEFRAMES.forEach(tf => {
      const rsiStr = tech[`RSI_${tf}`];
      const ema7Str = tech[`E7_${tf}`];
      const ema21Str = tech[`E21_${tf}`];

      const rsi = rsiStr ? parseFloat(rsiStr.split(' | ')[0]) : NaN;
      const ema7 = ema7Str ? parseFloat(ema7Str.split(' | ')[0]) : NaN;
      const ema21 = ema21Str ? parseFloat(ema21Str.split(' | ')[0]) : NaN;

      if (!isNaN(rsi) && !isNaN(ema7) && !isNaN(ema21)) {
        if (ema7 > ema21 && rsi > 50 && rsi < 75) {
          scores.buy++;
          analysis.push(`[${tf}] Trend Bullish: Preço > EMA21 e RSI saudável (${rsi.toFixed(0)}).`);
        }
        if (ema7 < ema21 && rsi < 50 && rsi > 25) {
          scores.sell++;
          analysis.push(`[${tf}] Trend Bearish: Preço < EMA21 e RSI em queda (${rsi.toFixed(0)}).`);
        }
        if (rsi >= 80) analysis.push(`[${tf}] Alerta de Topo: Ativo sobrecomprado.`);
        if (rsi <= 20) analysis.push(`[${tf}] Alerta de Fundo: Ativo sobrevendido.`);
      }
    });

    if (scores.buy >= 3) return { label: "🚀 STRONG BUY", color: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20", desc: analysis.join(' | ') };
    if (scores.sell >= 3) return { label: "🔻 STRONG SHORT", color: "bg-rose-600 text-white shadow-lg shadow-rose-600/20", desc: analysis.join(' | ') };
    if (scores.buy >= 1) return { label: "📈 BUY", color: "text-emerald-400 border border-emerald-500/30 bg-emerald-500/10", desc: analysis.join(' | ') };
    if (scores.sell >= 1) return { label: "📉 SELL", color: "text-rose-400 border border-rose-500/30 bg-rose-500/10", desc: analysis.join(' | ') };

    return { label: "NEUTRAL", color: "border border-white/10 text-slate-500 bg-slate-900", desc: "Aguardando confluência direcional MTF." };
  };

  const runScanner = async () => {
    setLoading(true);
    setStatus("Buscando dados de mercado...");
    try {
      const binanceRes = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
      let mcapData = [];

      try {
        const cgRes = await axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250');
        mcapData = cgRes.data;
      } catch (cgError) {
        console.warn("CoinGecko API indisponível. Market Cap temporariamente 0.");
      }

      const marketMap = new Map();
      mcapData.forEach(c => marketMap.set(c.symbol.toUpperCase(), { cap: c.market_cap, rank: c.market_cap_rank }));

      const forceArr = globalFilters.force.split(',').map(s => s.trim().toUpperCase());
      const excludeArr = globalFilters.exclude.split(',').map(s => s.trim().toUpperCase());

      const filtered = binanceRes.data.filter(t => {
        const base = t.symbol.replace(/USDT$|USDC$/, "");
        if (!t.symbol.endsWith('USDT') && !t.symbol.endsWith('USDC')) return false;
        if (excludeArr.some(ex => base.startsWith(ex)) || ["USDT", "USDC", "FDUSD", "DAI"].includes(base)) return false;

        const info = marketMap.get(base) || { cap: 0 };
        const meetsCriteria = parseInt(t.count) >= globalFilters.minTrades &&
          parseFloat(t.quoteVolume) >= (globalFilters.minVol * 1000000) &&
          (info.cap >= (globalFilters.minCap * 1000000) || info.cap === 0);

        return meetsCriteria || forceArr.includes(base);
      });

      const results = [];
      for (let idx = 0; idx < filtered.length; idx++) {
        const pair = filtered[idx];
        setStatus(`Analisando (${idx + 1}/${filtered.length}): ${pair.symbol}`);

        const base = pair.symbol.replace(/USDT$|USDC$/, "");
        const info = marketMap.get(base) || { cap: 0, rank: 9999 };
        const vol24h = parseFloat(pair.quoteVolume);

        let row = {
          symbol: pair.symbol,
          price: parseFloat(pair.lastPrice),
          trades: parseInt(pair.count),
          vol: vol24h,
          cap: info.cap,
          rank: info.rank,
          volCap: info.cap > 0 ? (vol24h / info.cap) * 100 : 0,
          tech: {},
          klines: {}
        };

        for (const tf of TIMEFRAMES) {
          const k = await fetchKlines(pair.symbol, tf);
          if (k && k.length > 0) {
            row.klines[tf] = k;

            const c = k.map(d => d.close), h = k.map(d => d.high), l = k.map(d => d.low), v = k.map(d => d.volume);

            // Função formatadora BLINDADA: Aceita matrizes de qualquer tamanho sem retornar NaN acidentalmente.
            const fmt = (arr) => {
              if (!arr || !Array.isArray(arr) || arr.length === 0) return "N/A";
              const recentValues = arr.slice(-3).reverse();
              return recentValues.map(val => (val !== undefined && val !== null && !isNaN(val)) ? val.toFixed(2) : "NaN").join(' | ');
            };

            row.tech[`RSI_${tf}`] = fmt(TI.RSI.calculate({ values: c, period: 14 }));
            row.tech[`MFI_${tf}`] = fmt(TI.MFI.calculate({ high: h, low: l, close: c, volume: v, period: 14 }));
            row.tech[`ADX_${tf}`] = fmt(TI.ADX.calculate({ high: h, low: l, close: c, period: 14 }).map(x => x.adx));
            row.tech[`E7_${tf}`] = fmt(TI.EMA.calculate({ values: c, period: 7 }));
            row.tech[`E21_${tf}`] = fmt(TI.EMA.calculate({ values: c, period: 21 }));
            row.tech[`E50_${tf}`] = fmt(TI.EMA.calculate({ values: c, period: 50 }));
            row.tech[`E100_${tf}`] = fmt(TI.EMA.calculate({ values: c, period: 100 }));
            row.tech[`V_SMA_${tf}`] = fmt(TI.SMA.calculate({ values: v, period: 20 }));
          }
        }
        row.signal = getMTFSignal(row.tech);
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
            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">Binance<span className="text-[#f3ba2f]">Scanner</span> <span className="text-[10px] bg-[#f3ba2f] text-black px-2 py-1 rounded not-italic font-bold ml-2 align-middle">v7.3 DATA-SAFE</span></h1>
            <div className="flex items-center gap-4 mt-3">
              <p className="text-slate-400 text-[11px] uppercase font-bold tracking-[0.2em]">High-Performance Trading Intelligence Dashboard</p>
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
                <th onClick={() => requestSort('signal')} className="p-4 border-b border-white/5 text-center min-w-[160px] max-w-[160px] sticky left-[390px] z-40 bg-[#1e2329] border-r border-white/5 font-black tracking-widest cursor-pointer hover:bg-white/5 transition-colors">MTF SIGNAL</th>

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

                {INDICATORS.map(ind => TIMEFRAMES.map(tf => (
                  <th key={ind.key + tf} className="p-4 border-l border-white/5 border-b border-white/5 bg-[#0b0e11]/30 text-center min-w-[95px]">
                    <div className="flex flex-col"><span className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">{ind.label}</span><span className="text-[#f3ba2f] font-mono text-[9px]">{tf}</span></div>
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, i) => (
                <tr key={i} className="group hover:bg-white/[0.03] transition-colors border-b border-white/5 last:border-0">
                  <td className="p-4 text-slate-600 font-mono sticky left-0 z-30 bg-[#161a1e] group-hover:bg-[#1e2329] min-w-[50px] border-b border-white/5">{i + 1}</td>
                  <td className="p-4 text-center sticky left-[50px] z-30 bg-[#161a1e] group-hover:bg-[#1e2329] text-slate-500 font-bold min-w-[70px] border-b border-white/5">#{row.rank}</td>
                  <td className="p-4 sticky left-[120px] bg-[#161a1e] group-hover:bg-[#1e2329] z-30 border-r border-b border-white/5 min-w-[150px]">
                    <a href={`https://www.tradingview.com/chart/?symbol=BINANCE:${row.symbol}`} target="_blank" rel="noopener noreferrer" className="font-black text-[#f3ba2f] hover:text-white flex flex-col group-hover:underline underline-offset-4 decoration-2">
                      {row.symbol} <span className="text-[7px] font-normal text-slate-500 mt-0.5 uppercase italic tracking-widest">TradingView ↗</span>
                    </a>
                  </td>
                  <td className="p-4 font-mono text-cyan-400 font-bold sticky left-[270px] z-30 bg-[#161a1e] group-hover:bg-[#1e2329] border-r border-b border-white/5 text-right min-w-[120px]">
                    {row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                  </td>
                  <td className="p-4 border-b border-white/5 text-center sticky left-[390px] z-30 bg-[#161a1e] group-hover:bg-[#1e2329] border-r min-w-[160px] relative group/tip overflow-visible">
                    <span className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-tighter cursor-help transition-all shadow-md ${row.signal.color}`}>{row.signal.label}</span>

                    <div className="absolute left-[105%] top-1/2 -translate-y-1/2 invisible group-hover/tip:visible z-[9999] w-[320px] p-4 bg-[#1e2329] border border-[#f3ba2f]/50 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white text-[10px] leading-relaxed backdrop-blur-xl pointer-events-none">
                      <div className="font-black text-[#f3ba2f] border-b border-white/10 mb-2 pb-1 uppercase italic tracking-widest text-[11px]">Confluência MTF</div>
                      <div className="space-y-1">{row.signal.desc.split(' | ').map((l, idx) => <div key={idx} className="flex gap-2 text-slate-300"><span className="text-[#f3ba2f]">▸</span><span>{l}</span></div>)}</div>
                    </div>
                  </td>

                  <td className="p-4 text-slate-400 border-b border-white/5 text-center font-mono">${(row.cap / 1000000).toFixed(0)}M</td>
                  <td className="p-4 text-slate-400 border-b border-white/5 text-center font-mono">{row.trades.toLocaleString()}</td>
                  <td className="p-4 text-slate-300 border-b border-white/5 text-center font-mono">${(row.vol / 1000000).toFixed(1)}M</td>
                  <td className="p-4 border-b border-white/5 text-center font-black font-mono">
                    <span className={`px-2 py-1 rounded text-[10px] ${row.volCap > 15 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' : 'text-slate-600'}`}>{row.volCap.toFixed(2)}%</span>
                  </td>

                  {INDICATORS.map(ind => TIMEFRAMES.map(tf => {
                    const val = row.tech[`${ind.key}_${tf}`];

                    // Renderização de Célula Blindada:
                    if (!val || val === "N/A") {
                      return (
                        <td key={ind.key + tf} className="p-4 border-l border-white/5 border-b border-white/5 text-center" title="Histórico insuficiente para este indicador.">
                          <span className="text-slate-700 font-black cursor-not-allowed">-</span>
                        </td>
                      );
                    }

                    const pts = val.split(' | ').map(parseFloat);
                    const curr = pts[0];
                    const prev = !isNaN(pts[1]) ? pts[1] : curr;
                    const older = !isNaN(pts[2]) ? pts[2] : prev;

                    const color = curr > prev ? "text-emerald-400" : curr < prev ? "text-rose-500" : "text-amber-400";

                    return (
                      <td key={ind.key + tf} className="p-4 border-l border-white/5 border-b border-white/5 text-center">
                        <div className={`font-black text-[11px] ${color}`}>{!isNaN(curr) ? curr.toFixed(2) : '-'}</div>
                        <div className="text-[8px] text-slate-600 font-mono mt-0.5">
                          {!isNaN(pts[1]) ? pts[1].toFixed(1) : '-'} | {!isNaN(pts[2]) ? pts[2].toFixed(1) : '-'}
                        </div>
                      </td>
                    );
                  }))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="p-8 bg-[#1e2329] rounded-3xl border border-white/5 text-[10px] text-slate-400 shadow-2xl mb-12">
          <h4 className="text-white font-black uppercase mb-6 tracking-[0.3em] border-b border-white/10 pb-4 flex items-center gap-2">
            <span className="text-[#f3ba2f]">///</span> Guia de Operação e Legendas
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div>
              <h5 className="text-[#f3ba2f] font-bold uppercase tracking-widest mb-3">Leitura de Indicadores</h5>
              <ul className="space-y-3 font-medium">
                <li className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> <span className="text-white">VERDE:</span> Valor Atual {'>'} Anterior</li>
                <li className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> <span className="text-white">VERMELHO:</span> Valor Atual {'<'} Anterior</li>
                <li className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> <span className="text-white">AMARELO:</span> Sem Alteração</li>
                <li className="mt-4 text-[9px] font-mono bg-black/30 p-2 rounded border border-white/5 text-slate-500">
                  Um traço (<span className="font-black text-slate-300">-</span>) significa que a moeda é muito recente para calcular aquele indicador (ex: EMA100 no 1W exige 100 semanas).
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-[#f3ba2f] font-bold uppercase tracking-widest mb-3">Lógica e Exportação</h5>
              <p className="leading-relaxed mb-4 text-slate-400">O botão <span className="text-[#f3ba2f] font-bold">EXPORTAR DADOS</span> permite baixar o histórico bruto de 201 candles em todos os timeframes testados. Ideal para machine learning.</p>
              <div className="grid grid-cols-2 gap-2 text-slate-500 font-bold uppercase text-[9px]">
                <div className="bg-black/20 p-2 rounded border-l-2 border-[#f3ba2f]">RSI: Sobrecompra</div>
                <div className="bg-black/20 p-2 rounded border-l-2 border-[#f3ba2f]">MFI: Fluxo Volume</div>
                <div className="bg-black/20 p-2 rounded border-l-2 border-[#f3ba2f]">ADX: Trend Força</div>
                <div className="bg-black/20 p-2 rounded border-l-2 border-[#f3ba2f]">Vol/Cap: Liquidez</div>
              </div>
            </div>

            <div className="flex flex-col justify-between">
              <div>
                <h5 className="text-[#f3ba2f] font-bold uppercase tracking-widest mb-3">Informações de API</h5>
                <p className="leading-relaxed font-medium">Os dados de Preço, Volume e Klines são fornecidos nativamente pela <strong>Binance API</strong>. A capitalização de mercado e o Ranking Global são sincronizados via <strong>CoinGecko</strong>.</p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10 text-slate-600 font-black tracking-widest uppercase flex justify-between">
                <span>Binance Scanner PRO</span>
                <span>v7.3 Data-Safe Build</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}