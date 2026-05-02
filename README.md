# 📊 Binance Scanner Pro

**Crypto Scanner for Binance USDT/USDC pairs with technical indicators.**

O **Binance Scanner** é uma aplicação web de alta performance desenvolvida com **Next.js** para traders que precisam monitorar o mercado em tempo real. Ele filtra ativos na Binance baseando-se em volume, capitalização de mercado e volume de negociações, calculando automaticamente 9 indicadores técnicos em 4 timeframes diferentes.

---

## 🚀 Funcionalidades

- **Filtros Avançados:** Filtre por Market Cap, Volume (24h) e quantidade de negociações.
- **Whitelist & Blacklist:** Opções para forçar a inclusão de moedas específicas ou excluir ativos indesejados.
- **Multi-Timeframe:** Análise técnica simultânea em **1h, 4h, 1d e 1w**.
- **9 Indicadores Técnicos:**
    - RSI, MFI, ADX, ATR.
    - Médias Móveis Exponenciais (EMA 7, 21, 50, 100).
    - Média Móvel de Volume (VSMA 20).
- **Interface Inteligente:**
    - Colunas agrupadas por indicador.
    - Identificação visual de tendência (Verde: Alta | Vermelho: Baixa | Amarelo: Estável).
    - Ordenação dinâmica por qualquer coluna de mercado.
    - Coluna de Símbolo fixa (Sticky) para facilitar a navegação lateral.

---

## 🛠️ Tecnologias Utilizadas

- [Next.js](https://nextjs.org/) - Framework React para produção.
- [Tailwind CSS](https://tailwindcss.com/) - Estilização moderna e responsiva.
- [Axios](https://axios-http.com/) - Cliente HTTP para consumo de APIs.
- [TechnicalIndicators](https://github.com/anandanand84/technicalindicators) - Biblioteca para cálculos matemáticos de trading.
- [Binance API](https://binance-docs.github.io/apidocs/spot/en/) - Dados de mercado em tempo real.
- [CoinGecko API](https://www.coingecko.com/en/api) - Dados de Capitalização de Mercado.

---

## 📦 Instalação e Uso

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/seu-usuario/binance-scanner.git](https://github.com/seu-usuario/binance-scanner.git)
   cd binance-scanner