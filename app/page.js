import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0e11] text-[#eaecef] font-sans p-6 flex items-center justify-center">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">
            Binance<span className="text-[#f3ba2f]">Scanner</span>
          </h1>
          <p className="text-slate-400 text-[11px] uppercase font-bold tracking-[0.2em] mt-3">
            High-Performance Trading Intelligence Dashboard
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/futures"
            className="group block bg-[#1e2329] border border-white/5 hover:border-[#f3ba2f]/50 rounded-2xl p-8 shadow-2xl transition-all"
          >
            <div className="text-[10px] bg-[#f3ba2f] text-black px-2 py-1 rounded font-bold inline-block mb-4 uppercase tracking-widest">
              Ativo
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight group-hover:text-[#f3ba2f] transition-colors">
              Futures USDT-M
            </h2>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              Scanner de contratos perpétuos da Binance Futures (produção), pares USDT-M.
            </p>
            <span className="inline-block mt-6 text-[11px] font-black uppercase tracking-widest text-[#f3ba2f] group-hover:translate-x-1 transition-transform">
              Abrir Scanner →
            </span>
          </Link>

          <Link
            href="/spot"
            className="group block bg-[#1e2329] border border-white/5 hover:border-slate-500/50 rounded-2xl p-8 shadow-2xl transition-all"
          >
            <div className="text-[10px] bg-slate-700 text-slate-200 px-2 py-1 rounded font-bold inline-block mb-4 uppercase tracking-widest">
              Arquivado
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight group-hover:text-slate-300 transition-colors">
              Spot (Legado)
            </h2>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              Versão anterior do scanner, baseada na Binance Spot API (USDT/USDC). Mantida apenas para consulta histórica.
            </p>
            <span className="inline-block mt-6 text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:translate-x-1 transition-transform">
              Abrir Versão Arquivada →
            </span>
          </Link>
        </div>

        <div className="text-center mt-12">
          <a href="https://github.com/leocairos/binance-scanner" target="_blank" rel="noreferrer" className="text-[10px] bg-slate-800 text-slate-300 px-3 py-1 rounded-md hover:bg-slate-700 transition-all font-mono">
            github.com/leocairos
          </a>
        </div>
      </div>
    </main>
  );
}
