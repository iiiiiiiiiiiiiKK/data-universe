import { useEffect, useState } from 'react';
import {
  Github,
  Globe,
  LayoutDashboard,
  Library,
  Menu,
  Moon,
  Sparkles,
  Sun,
  X as XIcon,
} from 'lucide-react';
import { useApp, type Route } from '@/stores/app';
import { cn } from '@/utils/cn';
import { IconButton } from '@/components/ui';

export const AUTHOR_X_URL = 'https://x.com/0xkillcoin';
export const REPO_URL = 'https://github.com/iiiiiiiiiiiiiKK/data-universe';

/** X (Twitter) glyph — drawn inline so it needs no icon dependency. */
function XGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function NavLink({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
        active ? 'text-[var(--text-0)]' : 'text-[var(--text-2)] hover:text-[var(--text-0)]',
        className,
      )}
    >
      {children}
      {active && (
        <span
          className="absolute inset-x-2.5 -bottom-[1px] h-[2px] rounded-full"
          style={{ background: 'var(--accent)' }}
        />
      )}
    </button>
  );
}

export function Header() {
  const route = useApp((s) => s.route);
  const setRoute = useApp((s) => s.setRoute);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const locale = useApp((s) => s.locale);
  const setLocale = useApp((s) => s.setLocale);
  const t = useApp((s) => s.t);
  const dataset = useApp((s) => s.dataset);

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  const go = (r: Route) => {
    setRoute(r);
    setMenuOpen(false);
  };

  const navItems: Array<{ route: Route; label: string }> = [
    { route: 'home', label: t('nav.home') },
    { route: 'examples', label: t('nav.examples') },
    { route: 'library', label: t('nav.library') },
  ];
  if (dataset) navItems.push({ route: 'workspace', label: t('nav.workspace') });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('du.theme', next);
    } catch {
      /* storage may be unavailable */
    }
  };

  const toggleLocale = () => {
    const next = locale === 'zh' ? 'en' : 'zh';
    setLocale(next);
    try {
      localStorage.setItem('du.locale', next);
    } catch {
      /* ignore */
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-30 w-full transition-all duration-300 safe-top',
        scrolled ? 'backdrop-blur-xl' : '',
      )}
      style={{
        background: scrolled ? 'color-mix(in srgb, var(--bg-0) 82%, transparent)' : 'transparent',
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
      }}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-5 lg:px-8">
        {/* Brand */}
        <button
          type="button"
          onClick={() => go('home')}
          className="group flex shrink-0 items-center gap-2.5"
          aria-label={t('app.name')}
        >
          <span
            className="relative grid h-8 w-8 place-items-center rounded-[10px] sm:h-9 sm:w-9"
            style={{
              background: 'linear-gradient(140deg, rgba(122,85,242,0.95), rgba(46,211,166,0.75))',
              boxShadow: '0 6px 20px -10px rgba(122,85,242,0.9)',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <ellipse cx="12" cy="12" rx="9.4" ry="3.4" stroke="#fff" strokeWidth="1.3" opacity="0.85" transform="rotate(-26 12 12)" />
              <ellipse cx="12" cy="12" rx="9.4" ry="3.4" stroke="#fff" strokeWidth="1.3" opacity="0.6" transform="rotate(28 12 12)" />
              <circle cx="12" cy="12" r="2.6" fill="#fff" />
            </svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-semibold tracking-tight text-[var(--text-0)]">
              Data Universe
            </span>
            <span className="mt-0.5 hidden text-[10px] tracking-[0.18em] text-[var(--text-2)] sm:block">
              数据宇宙
            </span>
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="ml-2 hidden items-center gap-0.5 md:flex" aria-label="main">
          {navItems.map((item) => (
            <NavLink key={item.route} active={route === item.route} onClick={() => go(item.route)}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Author X link — required at top, always visible on every breakpoint */}
        <a
          href={AUTHOR_X_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-all hover:-translate-y-[1px] sm:gap-2 sm:px-2.5"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--panel)',
            color: 'var(--text-1)',
          }}
          title={`${t('app.author')} · @0xkillcoin`}
          aria-label="作者 X / Author X — @0xkillcoin"
        >
          <XGlyph size={13} />
          <span className="hidden text-[12px] font-medium sm:inline">@0xkillcoin</span>
        </a>

        <div className="hidden items-center gap-0.5 sm:flex">
          <IconButton label={t('nav.about')} onClick={() => go('library')} className="hidden lg:inline-flex">
            <Library size={16} />
          </IconButton>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-0)] lg:inline-flex"
            aria-label="GitHub repository"
            title="GitHub"
          >
            <Github size={16} />
          </a>
          <IconButton label={t('theme.dark') + ' / ' + t('theme.light')} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
          <button
            type="button"
            onClick={toggleLocale}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-0)]"
            aria-label="Switch language"
            title="Switch language"
          >
            <Globe size={14} />
            <span className="uppercase">{locale}</span>
          </button>
        </div>

        {/* Mobile actions */}
        <div className="flex items-center gap-0.5 sm:hidden">
          <IconButton label="theme" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
          <IconButton label="menu" onClick={() => setMenuOpen((v) => !v)} active={menuOpen}>
            {menuOpen ? <XIcon size={18} /> : <Menu size={18} />}
          </IconButton>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          className="border-t px-3 pb-3 pt-2 md:hidden"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-1)' }}
        >
          <div className="grid gap-1">
            {navItems.map((item) => (
              <button
                key={item.route}
                type="button"
                onClick={() => go(item.route)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  route === item.route
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : 'text-[var(--text-1)] hover:bg-[var(--panel)]',
                )}
              >
                {item.route === 'workspace' ? <LayoutDashboard size={15} /> : item.route === 'library' ? <Library size={15} /> : <Sparkles size={15} />}
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <a
              href={AUTHOR_X_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium"
              style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            >
              <XGlyph size={13} /> @0xkillcoin
            </a>
            <button
              type="button"
              onClick={toggleLocale}
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium"
              style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            >
              <Globe size={13} /> {locale === 'zh' ? 'English' : '中文'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
