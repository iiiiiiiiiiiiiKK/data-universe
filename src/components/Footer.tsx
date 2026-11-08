import { Github, Heart } from 'lucide-react';
import { useApp } from '@/stores/app';
import { AUTHOR_X_URL, REPO_URL } from './Header';

export function Footer() {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);

  return (
    <footer className="mt-auto border-t border-line px-3 py-8 sm:px-5 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-display text-[13px] font-semibold text-0">Data Universe</span>
            <span className="text-[11px] text-2">· 数据宇宙</span>
          </div>
          <p className="max-w-md text-[11px] leading-relaxed text-2">
            {locale === 'zh'
              ? 'Local-first 数据可视化创作平台。所有解析与渲染都在你的浏览器中完成，数据不会上传到服务器。'
              : 'A local-first data visualization studio. All parsing and rendering happen in your browser; nothing is uploaded.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-2">
          <a
            href={AUTHOR_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors hover:text-[var(--text-0)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            @0xkillcoin
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors hover:text-[var(--text-0)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <Github size={11} /> GitHub
          </a>
          <span className="inline-flex items-center gap-1 px-1">
            MIT License
          </span>
          <span className="inline-flex items-center gap-1 px-1">
            <Heart size={10} /> {t('app.localFirst')}
          </span>
        </div>
      </div>
    </footer>
  );
}
