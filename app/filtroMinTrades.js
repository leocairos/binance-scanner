import { setTimeout } from 'timers/promises';

// Configurações dos filtros
const CONFIG = {
  MIN_TICKET: 300,    // Valor mínimo em USD por ordem
  MAX_TICKET: 2500,   // Valor máximo em USD por ordem
  TOP_PERCENT: 0.30,  // Top 30% de volume de trades
};

async function fetchFuturesMarketData() {
  const url = 'https://fapi.binance.com/fapi/v1/ticker/24hr';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro na API da Binance: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Falha ao obter dados:', error.message);
    return null;
  }
}

async function getFilteredSymbols() {
  const rawData = await fetchFuturesMarketData();
  if (!rawData) return [];

  // 1. Filtrar pares USDT ativos e estruturar dados numéricos
  const processedPairs = rawData
    .filter(item => item.symbol.endsWith('USDT'))
    .map(item => {
      const count = parseInt(item.count, 10);
      const quoteVolume = parseFloat(item.quoteVolume); // Volume em USDT
      return {
        symbol: item.symbol,
        tradeCount: count,
        volumeUSDT: quoteVolume,
        avgTicket: count > 0 ? (quoteVolume / count) : 0,
        priceChangePercent: parseFloat(item.priceChangePercent)
      };
    })
    .filter(item => item.tradeCount > 0 && item.volumeUSDT > 0);

  // 2. Ordenar decrescente pelo número de trades (Liquidez orgânica)
  processedPairs.sort((a, b) => b.tradeCount - a.tradeCount);

  // 3. Recortar o Top 30% com maior quantidade de negociações
  const cutoffIndex = Math.floor(processedPairs.length * CONFIG.TOP_PERCENT);
  const top30Percent = processedPairs.slice(0, cutoffIndex);

  // 4. Aplicar o filtro de Ticket Médio
  const filteredCandidates = top30Percent.filter(item =>
    item.avgTicket >= CONFIG.MIN_TICKET && item.avgTicket <= CONFIG.MAX_TICKET
  );

  return filteredCandidates;
}

// Execução
(async () => {
  console.log('Buscando e filtrando mercado de Futuros...');
  const candidates = await getFilteredSymbols();

  console.table(candidates.map(c => ({
    Ativo: c.symbol,
    'Trades (24h)': c.tradeCount.toLocaleString(),
    'Vol (USDT)': `$${c.volumeUSDT.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    'Ticket Médio': `$${c.avgTicket.toFixed(2)}`,
    'Var %': `${c.priceChangePercent.toFixed(2)}%`
  })));

  console.log(`\nFiltro concluído. ${candidates.length} ativos selecionados de forma segura.`);
})();