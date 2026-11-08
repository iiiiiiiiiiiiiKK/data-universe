import type { DataRow, DemoDatasetInfo } from '@/types';
import { mulberry32 } from '@/utils/cn';

/**
 * Demo datasets.
 *
 * Every dataset here is clearly labelled as a demo dataset in the UI. Values
 * are procedurally generated with a fixed seed so results are reproducible,
 * but they mirror the real column structure of the domain they describe.
 * No live/real-time data is claimed.
 */

const rand = mulberry32(0x5eed11);

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]!;
}

function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/* ------------------------------------------------------------- */
/* 1. Crypto Market                                              */
/* ------------------------------------------------------------- */

function buildCrypto(): { fields: string[]; rows: DataRow[] } {
  const r = mulberry32(1001);
  const coins = [
    { symbol: 'BTC', name: 'Bitcoin', base: 67000, cap: 1.32e12, chain: 'Bitcoin' },
    { symbol: 'ETH', name: 'Ethereum', base: 3500, cap: 4.2e11, chain: 'Ethereum' },
    { symbol: 'SOL', name: 'Solana', base: 165, cap: 7.6e10, chain: 'Solana' },
    { symbol: 'BNB', name: 'BNB', base: 590, cap: 8.7e10, chain: 'BNB Chain' },
    { symbol: 'XRP', name: 'XRP', base: 0.52, cap: 2.9e10, chain: 'XRP Ledger' },
    { symbol: 'ADA', name: 'Cardano', base: 0.45, cap: 1.6e10, chain: 'Cardano' },
    { symbol: 'AVAX', name: 'Avalanche', base: 28, cap: 1.1e10, chain: 'Avalanche' },
    { symbol: 'DOT', name: 'Polkadot', base: 6.1, cap: 8.7e9, chain: 'Polkadot' },
    { symbol: 'LINK', name: 'Chainlink', base: 14, cap: 8.2e9, chain: 'Ethereum' },
    { symbol: 'MATIC', name: 'Polygon', base: 0.68, cap: 6.8e9, chain: 'Polygon' },
    { symbol: 'UNI', name: 'Uniswap', base: 7.8, cap: 5.9e9, chain: 'Ethereum' },
    { symbol: 'ATOM', name: 'Cosmos', base: 8.4, cap: 3.3e9, chain: 'Cosmos' },
    { symbol: 'ARB', name: 'Arbitrum', base: 0.92, cap: 2.6e9, chain: 'Arbitrum' },
    { symbol: 'OP', name: 'Optimism', base: 1.85, cap: 2.1e9, chain: 'Optimism' },
    { symbol: 'NEAR', name: 'NEAR', base: 5.2, cap: 5.7e9, chain: 'NEAR' },
    { symbol: 'SUI', name: 'Sui', base: 1.35, cap: 3.4e9, chain: 'Sui' },
    { symbol: 'APT', name: 'Aptos', base: 8.9, cap: 3.9e9, chain: 'Aptos' },
    { symbol: 'INJ', name: 'Injective', base: 22, cap: 2.1e9, chain: 'Injective' },
    { symbol: 'TIA', name: 'Celestia', base: 7.4, cap: 1.5e9, chain: 'Celestia' },
    { symbol: 'SEI', name: 'Sei', base: 0.48, cap: 1.6e9, chain: 'Sei' },
  ];
  const rows: DataRow[] = [];
  for (let d = 0; d < 90; d++) {
    for (const c of coins) {
      const drift = 1 + (r() - 0.48) * 0.06;
      const price = round(c.base * (0.82 + r() * 0.4) * drift, c.base < 1 ? 4 : 2);
      const change24h = round((r() - 0.5) * 18, 2);
      const volume = Math.round(c.cap * (0.008 + r() * 0.05));
      const date = new Date(Date.UTC(2026, 2, 1) + d * 86400000);
      rows.push({
        date: date.toISOString().slice(0, 10),
        symbol: c.symbol,
        name: c.name,
        price,
        change_24h: change24h,
        volume_usd: volume,
        market_cap_usd: Math.round(c.cap * (0.9 + r() * 0.22)),
        chain: c.chain,
        rank: coins.indexOf(c) + 1,
      });
    }
  }
  return {
    fields: ['date', 'symbol', 'name', 'price', 'change_24h', 'volume_usd', 'market_cap_usd', 'chain', 'rank'],
    rows,
  };
}

/* ------------------------------------------------------------- */
/* 2. Personal Finance                                           */
/* ------------------------------------------------------------- */

function buildFinance(): { fields: string[]; rows: DataRow[] } {
  const r = mulberry32(2002);
  const categories = [
    { name: '餐饮', merchant: ['星巴克', '瑞幸咖啡', '海底捞', '便利蜂', '麦当劳'], min: 12, max: 480 },
    { name: '交通', merchant: ['滴滴出行', '地铁', '共享单车', '高铁', '加油站'], min: 3, max: 900 },
    { name: '购物', merchant: ['京东', '淘宝', '优衣库', '山姆会员店'], min: 40, max: 2600 },
    { name: '居住', merchant: ['房租', '物业费', '水电燃气'], min: 120, max: 7800 },
    { name: '娱乐', merchant: ['电影票', '健身房', '网易云音乐', 'Steam'], min: 15, max: 1200 },
    { name: '医疗', merchant: ['药房', '体检中心', '口腔诊所'], min: 30, max: 3600 },
    { name: '教育', merchant: ['图书', '在线课程', '考试报名'], min: 25, max: 4200 },
    { name: '订阅', merchant: ['Netflix', 'Spotify', 'iCloud', 'ChatGPT Plus'], min: 6, max: 240 },
  ];
  const accounts = ['微信支付', '支付宝', '招商银行信用卡', '工商银行储蓄卡'];
  const rows: DataRow[] = [];
  for (let i = 0; i < 620; i++) {
    const cat = pick(categories, r);
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 28);
    const hour = 7 + Math.floor(r() * 16);
    const amount = round(cat.min + r() * (cat.max - cat.min), 2);
    const isIncome = r() < 0.06;
    rows.push({
      date: `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`,
      category: cat.name,
      merchant: pick(cat.merchant, r),
      amount: isIncome ? round(3000 + r() * 12000, 2) : -amount,
      type: isIncome ? '收入' : '支出',
      account: pick(accounts, r),
      is_recurring: r() < 0.18,
      budget_month: Math.round(1200 + r() * 2400),
    });
  }
  return {
    fields: ['date', 'category', 'merchant', 'amount', 'type', 'account', 'is_recurring', 'budget_month'],
    rows,
  };
}

/* ------------------------------------------------------------- */
/* 3. GitHub Ecosystem                                          */
/* ------------------------------------------------------------- */

function buildGitHub(): { fields: string[]; rows: DataRow[] } {
  const r = mulberry32(3003);
  const projects = [
    { repo: 'facebook/react', lang: 'JavaScript', owner: 'facebook', stars: 228000, forks: 46600, issues: 1030 },
    { repo: 'vuejs/core', lang: 'TypeScript', owner: 'vuejs', stars: 48600, forks: 8500, issues: 620 },
    { repo: 'microsoft/vscode', lang: 'TypeScript', owner: 'microsoft', stars: 164000, forks: 29600, issues: 8100 },
    { repo: 'flutter/flutter', lang: 'Dart', owner: 'flutter', stars: 166000, forks: 27600, issues: 12500 },
    { repo: 'rust-lang/rust', lang: 'Rust', owner: 'rust-lang', stars: 99000, forks: 12800, issues: 10400 },
    { repo: 'golang/go', lang: 'Go', owner: 'golang', stars: 125000, forks: 17800, issues: 9300 },
    { repo: 'tensorflow/tensorflow', lang: 'C++', owner: 'tensorflow', stars: 187000, forks: 74300, issues: 1900 },
    { repo: 'pytorch/pytorch', lang: 'Python', owner: 'pytorch', stars: 83000, forks: 22400, issues: 14600 },
    { repo: 'vercel/next.js', lang: 'JavaScript', owner: 'vercel', stars: 127000, forks: 27200, issues: 2900 },
    { repo: 'sveltejs/svelte', lang: 'JavaScript', owner: 'sveltejs', stars: 80000, forks: 4200, issues: 870 },
    { repo: 'denoland/deno', lang: 'Rust', owner: 'denoland', stars: 98000, forks: 5400, issues: 2100 },
    { repo: 'tailwindlabs/tailwindcss', lang: 'TypeScript', owner: 'tailwindlabs', stars: 83000, forks: 4200, issues: 120 },
    { repo: 'mrdoob/three.js', lang: 'JavaScript', owner: 'mrdoob', stars: 103000, forks: 35300, issues: 480 },
    { repo: 'd3/d3', lang: 'JavaScript', owner: 'd3', stars: 109000, forks: 23300, issues: 22 },
    { repo: 'apache/echarts', lang: 'TypeScript', owner: 'apache', stars: 61000, forks: 19600, issues: 2400 },
    { repo: 'supabase/supabase', lang: 'TypeScript', owner: 'supabase', stars: 74000, forks: 7200, issues: 430 },
    { repo: 'hoppscotch/hoppscotch', lang: 'TypeScript', owner: 'hoppscotch', stars: 65000, forks: 4500, issues: 340 },
    { repo: 'ziglang/zig', lang: 'Zig', owner: 'ziglang', stars: 35000, forks: 2600, issues: 3200 },
  ];
  const rows: DataRow[] = [];
  for (const p of projects) {
    const months = 24;
    for (let m = 0; m < months; m++) {
      const growth = 1 + m * (0.004 + r() * 0.02);
      const d = new Date(Date.UTC(2024, 10, 1));
      d.setUTCMonth(d.getUTCMonth() + m);
      rows.push({
        month: d.toISOString().slice(0, 7),
        repo: p.repo,
        owner: p.owner,
        language: p.lang,
        stars: Math.round(p.stars * growth * (0.98 + r() * 0.04)),
        forks: Math.round(p.forks * growth * (0.98 + r() * 0.05)),
        open_issues: Math.round(p.issues * (0.85 + r() * 0.4)),
        contributors: Math.round(120 + r() * 2400 * (p.stars / 100000)),
        commits_month: Math.round(60 + r() * 900),
        license: pick(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'MPL-2.0'], r),
      });
    }
  }
  return {
    fields: [
      'month',
      'repo',
      'owner',
      'language',
      'stars',
      'forks',
      'open_issues',
      'contributors',
      'commits_month',
      'license',
    ],
    rows,
  };
}

/* ------------------------------------------------------------- */
/* 4. City Population                                            */
/* ------------------------------------------------------------- */

function buildCities(): { fields: string[]; rows: DataRow[] } {
  const r = mulberry32(4004);
  const cities: Array<[string, string, number, number, number]> = [
    ['Tokyo', 'Japan', 35.6762, 139.6503, 37.2],
    ['Delhi', 'India', 28.6139, 77.209, 32.9],
    ['Shanghai', 'China', 31.2304, 121.4737, 29.2],
    ['Dhaka', 'Bangladesh', 23.8103, 90.4125, 23.2],
    ['Sao Paulo', 'Brazil', -23.5505, -46.6333, 22.6],
    ['Cairo', 'Egypt', 30.0444, 31.2357, 22.2],
    ['Mexico City', 'Mexico', 19.4326, -99.1332, 22.1],
    ['Beijing', 'China', 39.9042, 116.4074, 21.8],
    ['Mumbai', 'India', 19.076, 72.8777, 21.3],
    ['Osaka', 'Japan', 34.6937, 135.5023, 19.0],
    ['New York', 'United States', 40.7128, -74.006, 18.9],
    ['Karachi', 'Pakistan', 24.8607, 67.0011, 17.6],
    ['Chongqing', 'China', 29.563, 106.5516, 17.2],
    ['Istanbul', 'Turkey', 41.0082, 28.9784, 15.9],
    ['Buenos Aires', 'Argentina', -34.6037, -58.3816, 15.4],
    ['Kolkata', 'India', 22.5726, 88.3639, 15.3],
    ['Manila', 'Philippines', 14.5995, 120.9842, 14.9],
    ['Lagos', 'Nigeria', 6.5244, 3.3792, 15.4],
    ['Rio de Janeiro', 'Brazil', -22.9068, -43.1729, 13.6],
    ['Guangzhou', 'China', 23.1291, 113.2644, 13.9],
    ['Los Angeles', 'United States', 34.0522, -118.2437, 12.5],
    ['Moscow', 'Russia', 55.7558, 37.6173, 12.7],
    ['Shenzhen', 'China', 22.5431, 114.0579, 12.8],
    ['Paris', 'France', 48.8566, 2.3522, 11.2],
    ['London', 'United Kingdom', 51.5074, -0.1278, 9.6],
    ['Bangkok', 'Thailand', 13.7563, 100.5018, 10.9],
    ['Seoul', 'South Korea', 37.5665, 126.978, 9.9],
    ['Singapore', 'Singapore', 1.3521, 103.8198, 6.0],
    ['Berlin', 'Germany', 52.52, 13.405, 3.7],
    ['Sydney', 'Australia', -33.8688, 151.2093, 5.3],
    ['Toronto', 'Canada', 43.6532, -79.3832, 6.3],
    ['Madrid', 'Spain', 40.4168, -3.7038, 6.7],
    ['Rome', 'Italy', 41.9028, 12.4964, 4.3],
    ['Dubai', 'United Arab Emirates', 25.2048, 55.2708, 3.5],
    ['Cape Town', 'South Africa', -33.9249, 18.4241, 4.8],
    ['Nairobi', 'Kenya', -1.2921, 36.8219, 5.1],
  ];
  const rows: DataRow[] = cities.map(([city, country, lat, lon, pop], i) => {
    const gdpPerCapita = Math.round(1800 + r() * 78000);
    return {
      city,
      country,
      lat: round(lat, 4),
      lon: round(lon, 4),
      population_m: pop,
      gdp_per_capita_usd: gdpPerCapita,
      density_per_km2: Math.round(900 + r() * 21000),
      growth_rate_pct: round(-0.4 + r() * 4.2, 2),
      region: pick(['Asia', 'Europe', 'Americas', 'Africa', 'Oceania'], r),
      rank: i + 1,
    };
  });
  return {
    fields: [
      'city',
      'country',
      'lat',
      'lon',
      'population_m',
      'gdp_per_capita_usd',
      'density_per_km2',
      'growth_rate_pct',
      'region',
      'rank',
    ],
    rows,
  };
}

/* ------------------------------------------------------------- */
/* 5. Website Analytics                                          */
/* ------------------------------------------------------------- */

function buildAnalytics(): { fields: string[]; rows: DataRow[] } {
  const r = mulberry32(5005);
  const channels = ['Organic Search', 'Direct', 'Social', 'Referral', 'Email', 'Paid Search'];
  const devices = ['desktop', 'mobile', 'tablet'];
  const countries = ['China', 'United States', 'Germany', 'India', 'Japan', 'Brazil', 'United Kingdom'];
  const pages = ['/', '/pricing', '/docs', '/blog', '/changelog', '/signup', '/dashboard'];
  const rows: DataRow[] = [];
  for (let d = 0; d < 60; d++) {
    const date = new Date(Date.UTC(2026, 4, 1) + d * 86400000);
    for (const ch of channels) {
      for (const dev of devices) {
        const base = ch === 'Organic Search' ? 4200 : ch === 'Direct' ? 2600 : ch === 'Social' ? 1800 : 900;
        const devMul = dev === 'mobile' ? 0.62 : dev === 'desktop' ? 0.33 : 0.05;
        const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.76 : 1;
        const sessions = Math.round(base * devMul * weekend * (0.82 + r() * 0.36));
        const users = Math.round(sessions * (0.7 + r() * 0.18));
        rows.push({
          date: date.toISOString().slice(0, 10),
          channel: ch,
          device: dev,
          country: pick(countries, r),
          landing_page: pick(pages, r),
          sessions,
          users,
          pageviews: Math.round(sessions * (1.4 + r() * 2.4)),
          bounce_rate: round(0.22 + r() * 0.52, 3),
          avg_session_sec: Math.round(32 + r() * 340),
          conversion_rate: round(0.004 + r() * 0.052, 4),
          revenue_usd: Math.round(sessions * (0.4 + r() * 6.2)),
        });
      }
    }
  }
  return {
    fields: [
      'date',
      'channel',
      'device',
      'country',
      'landing_page',
      'sessions',
      'users',
      'pageviews',
      'bounce_rate',
      'avg_session_sec',
      'conversion_rate',
      'revenue_usd',
    ],
    rows,
  };
}

/* ------------------------------------------------------------- */
/* Exports                                                       */
/* ------------------------------------------------------------- */

export const DEMO_DATASETS: DemoDatasetInfo[] = [
  {
    id: 'crypto',
    name: { zh: 'Crypto Market', en: 'Crypto Market' },
    description: {
      zh: '20 种主流加密资产连续 90 天的价格、24 小时涨跌、成交量与市值。结构接近真实行情快照，用于展示时间序列与市场星系。',
      en: '20 major crypto assets over 90 consecutive days: price, 24h change, volume and market cap. Structurally realistic, used to demonstrate time series and market galaxies.',
    },
    fieldsDoc: [
      { field: 'date', type: 'date', desc: { zh: '交易日', en: 'Trading date' } },
      { field: 'symbol', type: 'category', desc: { zh: '代币代号', en: 'Token symbol' } },
      { field: 'name', type: 'category', desc: { zh: '项目名称', en: 'Project name' } },
      { field: 'price', type: 'float', desc: { zh: '收盘价（USD）', en: 'Closing price (USD)' } },
      { field: 'change_24h', type: 'float', desc: { zh: '24 小时涨跌幅（%）', en: '24h change (%)' } },
      { field: 'volume_usd', type: 'integer', desc: { zh: '成交额（USD）', en: 'Volume (USD)' } },
      { field: 'market_cap_usd', type: 'integer', desc: { zh: '市值（USD）', en: 'Market cap (USD)' } },
      { field: 'chain', type: 'category', desc: { zh: '所属公链', en: 'Host chain' } },
      { field: 'rank', type: 'integer', desc: { zh: '市值排名', en: 'Market cap rank' } },
    ],
    recommended: ['galaxy', 'timeline', 'distribution'],
    license: 'Demo Dataset · 程序生成，非实时数据',
    source: 'Data Universe built-in demo generator',
    build: buildCrypto,
  },
  {
    id: 'finance',
    name: { zh: 'Personal Finance', en: 'Personal Finance' },
    description: {
      zh: '620 条个人消费记录，含类别、商户、金额、账户与月度预算，适合展示消费宇宙与类别结构。',
      en: '620 personal spending records with category, merchant, amount, account and monthly budget — ideal for a spending universe.',
    },
    fieldsDoc: [
      { field: 'date', type: 'datetime', desc: { zh: '交易时间', en: 'Transaction time' } },
      { field: 'category', type: 'category', desc: { zh: '消费类别', en: 'Spending category' } },
      { field: 'merchant', type: 'category', desc: { zh: '商户', en: 'Merchant' } },
      { field: 'amount', type: 'float', desc: { zh: '金额，负数为支出', en: 'Amount; negative means expense' } },
      { field: 'type', type: 'category', desc: { zh: '收支类型', en: 'Income/expense type' } },
      { field: 'account', type: 'category', desc: { zh: '支付账户', en: 'Payment account' } },
      { field: 'is_recurring', type: 'boolean', desc: { zh: '是否周期性支出', en: 'Recurring expense' } },
      { field: 'budget_month', type: 'integer', desc: { zh: '当月预算', en: 'Monthly budget' } },
    ],
    recommended: ['galaxy', 'matrix', 'distribution', 'timeline'],
    license: 'Demo Dataset · 虚构数据',
    source: 'Data Universe built-in demo generator',
    build: buildFinance,
  },
  {
    id: 'github',
    name: { zh: 'GitHub Ecosystem', en: 'GitHub Ecosystem' },
    description: {
      zh: '18 个知名开源仓库连续 24 个月的 star、fork、issue、贡献者与提交量，用于展示开源生态关系网络。',
      en: '18 well-known open-source repositories across 24 months: stars, forks, issues, contributors and commits — for an ecosystem network.',
    },
    fieldsDoc: [
      { field: 'month', type: 'date', desc: { zh: '统计月份', en: 'Month' } },
      { field: 'repo', type: 'category', desc: { zh: '仓库全名', en: 'Repository full name' } },
      { field: 'owner', type: 'category', desc: { zh: '所属组织', en: 'Owner org' } },
      { field: 'language', type: 'category', desc: { zh: '主要语言', en: 'Primary language' } },
      { field: 'stars', type: 'integer', desc: { zh: 'Star 数', en: 'Stars' } },
      { field: 'forks', type: 'integer', desc: { zh: 'Fork 数', en: 'Forks' } },
      { field: 'open_issues', type: 'integer', desc: { zh: '未关闭 issue', en: 'Open issues' } },
      { field: 'contributors', type: 'integer', desc: { zh: '贡献者数量', en: 'Contributors' } },
      { field: 'commits_month', type: 'integer', desc: { zh: '当月提交数', en: 'Commits this month' } },
      { field: 'license', type: 'category', desc: { zh: '开源协议', en: 'License' } },
    ],
    recommended: ['network', 'galaxy', 'timeline'],
    license: 'Demo Dataset · 结构参照公开项目统计，数值为演示用途',
    source: 'Data Universe built-in demo generator',
    build: buildGitHub,
  },
  {
    id: 'cities',
    name: { zh: 'City Population', en: 'City Population' },
    description: {
      zh: '36 座全球主要城市的人口、经纬度、人均 GDP、密度与增长率，用于展示真实地理位置分布。',
      en: '36 major world cities with population, latitude/longitude, GDP per capita, density and growth — for real geographic distribution.',
    },
    fieldsDoc: [
      { field: 'city', type: 'string', desc: { zh: '城市名', en: 'City' } },
      { field: 'country', type: 'category', desc: { zh: '国家', en: 'Country' } },
      { field: 'lat', type: 'latitude', desc: { zh: '纬度', en: 'Latitude' } },
      { field: 'lon', type: 'longitude', desc: { zh: '经度', en: 'Longitude' } },
      { field: 'population_m', type: 'float', desc: { zh: '人口（百万）', en: 'Population (millions)' } },
      { field: 'gdp_per_capita_usd', type: 'integer', desc: { zh: '人均 GDP（USD）', en: 'GDP per capita (USD)' } },
      { field: 'density_per_km2', type: 'integer', desc: { zh: '人口密度', en: 'Density per km²' } },
      { field: 'growth_rate_pct', type: 'float', desc: { zh: '年增长率（%）', en: 'Annual growth (%)' } },
      { field: 'region', type: 'category', desc: { zh: '大洲区域', en: 'Region' } },
      { field: 'rank', type: 'integer', desc: { zh: '人口排名', en: 'Population rank' } },
    ],
    recommended: ['map', 'galaxy', 'distribution'],
    license: 'Demo Dataset · 城市坐标真实，指标为演示数值',
    source: 'Data Universe built-in demo generator',
    build: buildCities,
  },
  {
    id: 'analytics',
    name: { zh: 'Website Analytics', en: 'Website Analytics' },
    description: {
      zh: '60 天 × 6 渠道 × 3 设备的站点访问数据，含会话、用户、跳出率、转化率与收入。',
      en: '60 days × 6 channels × 3 devices of site traffic: sessions, users, bounce rate, conversion and revenue.',
    },
    fieldsDoc: [
      { field: 'date', type: 'date', desc: { zh: '日期', en: 'Date' } },
      { field: 'channel', type: 'category', desc: { zh: '流量渠道', en: 'Traffic channel' } },
      { field: 'device', type: 'category', desc: { zh: '设备类型', en: 'Device type' } },
      { field: 'country', type: 'category', desc: { zh: '国家', en: 'Country' } },
      { field: 'landing_page', type: 'category', desc: { zh: '落地页', en: 'Landing page' } },
      { field: 'sessions', type: 'integer', desc: { zh: '会话数', en: 'Sessions' } },
      { field: 'users', type: 'integer', desc: { zh: '用户数', en: 'Users' } },
      { field: 'pageviews', type: 'integer', desc: { zh: '浏览量', en: 'Pageviews' } },
      { field: 'bounce_rate', type: 'float', desc: { zh: '跳出率', en: 'Bounce rate' } },
      { field: 'avg_session_sec', type: 'integer', desc: { zh: '平均会话时长（秒）', en: 'Avg session (s)' } },
      { field: 'conversion_rate', type: 'float', desc: { zh: '转化率', en: 'Conversion rate' } },
      { field: 'revenue_usd', type: 'integer', desc: { zh: '收入（USD）', en: 'Revenue (USD)' } },
    ],
    recommended: ['timeline', 'matrix', 'distribution', 'galaxy'],
    license: 'Demo Dataset · 虚构数据',
    source: 'Data Universe built-in demo generator',
    build: buildAnalytics,
  },
];

export function getDemoDataset(id: string): DemoDatasetInfo | undefined {
  return DEMO_DATASETS.find((d) => d.id === id);
}

export { rand };
