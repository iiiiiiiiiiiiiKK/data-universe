import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Github,
  Layers,
  Lock,
  MapPin,
  Network,
  Shield,
  Sparkles,
  Table2,
  Wand2,
  Zap,
} from 'lucide-react';
import type { Dataset } from '@/types';
import { DEFAULT_MAX_FILE_BYTES } from '@/features/data-engine/parse';
import { formatBytes } from '@/utils/cn';
import { FileDrop } from '@/features/import/FileDrop';
import { DEMO_DATASETS } from '@/features/import/demos';
import { HeroUniverse } from '@/components/HeroUniverse';
import { Button } from '@/components/ui';
import { useApp } from '@/stores/app';
import { AUTHOR_X_URL } from '@/components/Header';

const MODES = [
  { icon: Sparkles, key: 'mode.galaxy', accent: '#8b6cff' },
  { icon: Network, key: 'mode.network', accent: '#6ce6c4' },
  { icon: Calendar, key: 'mode.timeline', accent: '#38bdf8' },
  { icon: MapPin, key: 'mode.map', accent: '#fb923c' },
  { icon: Table2, key: 'mode.matrix', accent: '#f472b6' },
  { icon: BarChart3, key: 'mode.distribution', accent: '#facc15' },
];

export function HomePage({
  onLoaded,
  onDemo,
}: {
  onLoaded: (dataset: Dataset, rawText: string | null) => void;
  onDemo: (id: string) => void;
}) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const [showAll, setShowAll] = useState(false);

  const demos = showAll ? DEMO_DATASETS : DEMO_DATASETS.slice(0, 3);

  return (
    <div className="relative">
      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 cosmic-bg" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 grid-fade opacity-40" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-90" aria-hidden="true">
          <HeroUniverse />
        </div>

        <div className="relative mx-auto w-full max-w-[1240px] px-4 pb-8 pt-12 sm:px-6 sm:pb-12 sm:pt-20 lg:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10.5px] font-medium tracking-wide" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-breathe" />
              {locale === 'zh' ? 'Local-first · 数据不会上传服务器' : 'Local-first · your data never leaves the browser'}
            </div>

            <h1 className="font-display text-[clamp(2rem,7vw,4.2rem)] font-bold leading-[1.04] tracking-[-0.03em]">
              <span className="block text-0">YOUR DATA.</span>
              <span
                className="block bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(120deg, #a3b8ff 0%, #c084fc 40%, #6ce6c4 78%, #a3b8ff 100%)',
                  WebkitBackgroundClip: 'text',
                }}
              >
                YOUR UNIVERSE.
              </span>
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-[13.5px] leading-relaxed text-1 sm:mt-5 sm:text-[15px]">
              {t('app.subtagline')}
            </p>
            <p className="mx-auto mt-2 max-w-lg text-[11.5px] leading-relaxed text-2 sm:text-xs">
              {locale === 'zh'
                ? 'CSV / JSON / XLSX / TSV → 自动识别字段 → 生成可探索、可编辑、可导出的交互式数据宇宙。'
                : 'CSV / JSON / XLSX / TSV → automatic field detection → an explorable, editable, exportable universe.'}
            </p>

            <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-3">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  const el = document.getElementById('upload-zone');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el?.querySelector<HTMLElement>('[role="button"]')?.click();
                }}
              >
                <Layers size={16} />
                {t('hero.upload')}
                <ArrowRight size={14} />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  const el = document.getElementById('demos');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <Wand2 size={15} />
                {t('hero.demo')}
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10.5px] text-2">
              <span className="inline-flex items-center gap-1.5">
                <Shield size={11} /> {formatBytes(DEFAULT_MAX_FILE_BYTES)} {locale === 'zh' ? '上限' : 'limit'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap size={11} /> {locale === 'zh' ? '6 种可视化模式' : '6 visual modes'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock size={11} /> {locale === 'zh' ? '纯浏览器解析' : 'In-browser parsing'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- upload ---------------- */}
      <section id="upload-zone" className="mx-auto w-full max-w-[880px] px-4 pb-10 sm:px-6 sm:pb-14">
        <FileDrop onLoaded={onLoaded} />
      </section>

      {/* ---------------- modes ---------------- */}
      <section className="mx-auto w-full max-w-[1240px] px-4 pb-10 sm:px-6 sm:pb-14">
        <div className="mb-4 text-center">
          <h2 className="font-display text-lg font-semibold tracking-tight text-0 sm:text-xl">
            {locale === 'zh' ? '六种数据宇宙' : 'Six universes'}
          </h2>
          <p className="mt-1 text-[11px] text-2 sm:text-xs">
            {locale === 'zh'
              ? '根据字段类型自动推荐，也可以随时切换。'
              : 'Recommended automatically from your field types — switch any time.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.key}
                className="group rounded-xl p-3 transition-all hover:-translate-y-0.5"
                style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
              >
                <span
                  className="mb-2 grid h-8 w-8 place-items-center rounded-lg"
                  style={{ background: `${m.accent}1f`, color: m.accent }}
                >
                  <Icon size={15} />
                </span>
                <h3 className="text-[12px] font-medium text-0">{t(m.key)}</h3>
                <p className="mt-1 text-[10px] leading-relaxed text-2">{t(`${m.key}.desc`)}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------- demos ---------------- */}
      <section id="demos" className="mx-auto w-full max-w-[1240px] px-4 pb-12 sm:px-6 sm:pb-16">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-0 sm:text-xl">{t('examples.title')}</h2>
            <p className="mt-1 text-[11px] text-2 sm:text-xs">{t('examples.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-2 transition-colors hover:bg-[var(--panel)] hover:text-1"
          >
            {showAll ? (locale === 'zh' ? '收起' : 'Show less') : locale === 'zh' ? `查看全部 ${DEMO_DATASETS.length} 组` : `All ${DEMO_DATASETS.length} datasets`}
          </button>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {demos.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onDemo(d.id)}
              className="group flex flex-col rounded-xl p-3.5 text-left transition-all hover:-translate-y-0.5"
              style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-medium text-0">{d.name[locale]}</h3>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                  style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}
                >
                  {t('examples.demo')}
                </span>
              </div>
              <p className="flex-1 text-[11px] leading-relaxed text-2">{d.description[locale]}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1">
                {d.recommended.slice(0, 3).map((m) => (
                  <span
                    key={m}
                    className="rounded px-1.5 py-0.5 text-[9px]"
                    style={{ background: 'var(--panel-strong)', color: 'var(--text-2)' }}
                  >
                    {t(`mode.${m}`)}
                  </span>
                ))}
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium accent-text opacity-0 transition-opacity group-hover:opacity-100">
                  {t('examples.use')} <ArrowRight size={10} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ---------------- privacy / about ---------------- */}
      <section className="mx-auto w-full max-w-[1240px] px-4 pb-14 sm:px-6 sm:pb-20">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {[
            {
              icon: Lock,
              title: locale === 'zh' ? '数据只在本地' : 'Data stays local',
              body:
                locale === 'zh'
                  ? '文件解析、统计计算和渲染全部在浏览器中完成。没有后端服务器，不会上传你的文件。'
                  : 'Parsing, statistics and rendering all happen in your browser. There is no backend and your files are never uploaded.',
            },
            {
              icon: Shield,
              title: locale === 'zh' ? '没有 AI 也没有黑箱' : 'No AI, no black box',
              body:
                locale === 'zh'
                  ? '字段识别与推荐都是明确的规则算法；相关矩阵会标注 Pearson / Spearman，并说明相关不等于因果。'
                  : 'Field detection and recommendations are explicit rules. Correlation matrices label Pearson/Spearman and state that correlation is not causation.',
            },
            {
              icon: Github,
              title: locale === 'zh' ? '开源可审计' : 'Open source',
              body:
                locale === 'zh'
                  ? '完整源码以 MIT 协议开源，可自行部署、修改和二次开发。'
                  : 'Full source is MIT licensed — deploy, modify and build on it freely.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-xl p-3.5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                <Icon size={16} className="mb-2 accent-text" />
                <h3 className="text-[12.5px] font-medium text-0">{item.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-2">{item.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <p className="text-[11px] text-2">
            {t('app.author')}{' '}
            <a
              href={AUTHOR_X_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium accent-text underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
            >
              @0xkillcoin
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
