/**
 * Small, dependency-free UI primitives shared by every feature.
 * Kept intentionally flat so feature code reads like plain markup.
 */
import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

/* ---------------------------------------------------------------- */
/* Buttons                                                           */
/* ---------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  className,
  disabled,
  title,
  type = 'button',
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  full?: boolean;
}) {
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'danger'
        ? 'btn-ghost text-red-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300'
        : variant === 'subtle'
          ? 'btn-subtle'
          : 'btn-ghost';
  const sizeClass = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : size === 'lg' ? 'px-5 py-2.5 text-[15px]' : '';
  return (
    <button
      type={type}
      className={cn('btn', variantClass, sizeClass, full && 'w-full', className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  active,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
        active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-2)] hover:bg-[var(--panel)] hover:text-[var(--text-0)]',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Form controls                                                     */
/* ---------------------------------------------------------------- */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-2">{hint}</p>}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={cn('select-input', className)}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
  min,
  max,
  step,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  onEnter?: () => void;
}) {
  return (
    <input
      type={type}
      className={cn('text-input', className)}
      value={value}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) onEnter();
      }}
    />
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  label,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] font-medium text-2">{label}</label>
        <span className="font-mono text-[11px] text-1">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="text-[12px] text-1">{label}</span>
      <span
        className={cn(
          'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
          )}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex gap-0.5 rounded-lg p-0.5',
        className,
      )}
      style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-colors',
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
            value === o.value
              ? 'bg-[var(--panel-strong)] text-[var(--text-0)] shadow-sm'
              : 'text-[var(--text-2)] hover:text-[var(--text-0)]',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Overlays                                                          */
/* ---------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl',
          width,
          'animate-fade-up',
        )}
        style={{ background: 'var(--bg-1)', border: '1px solid var(--border-strong)' }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-sm font-semibold text-0">
            {title}
          </h2>
          <IconButton label="close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="scroll-area flex-1 px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 safe-bottom">{footer}</div>}
      </div>
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  children,
  side = 'right',
  width = 'w-[min(420px,92vw)]',
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: 'right' | 'bottom' | 'left';
  width?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          'absolute flex flex-col overflow-hidden animate-fade-up',
          side === 'right' && `right-0 top-0 h-full ${width}`,
          side === 'left' && `left-0 top-0 h-full ${width}`,
          side === 'bottom' && 'bottom-0 left-0 right-0 max-h-[80dvh] rounded-t-2xl',
        )}
        style={{ background: 'var(--bg-1)', borderLeft: side === 'right' ? '1px solid var(--border-strong)' : undefined }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Misc                                                              */
/* ---------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="mb-1 text-2 opacity-60">{icon}</div>}
      <p className="text-sm font-medium text-1">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-2">{description}</p>}
      {action}
    </div>
  );
}

export function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] uppercase tracking-wider text-2">{label}</div>
      <div className={cn('mt-0.5 font-mono text-[13px] font-medium', accent ? 'accent-text' : 'text-0')}>{value}</div>
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
      <div
        className="h-full rounded-full transition-[width] duration-200"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: 'var(--accent)' }}
      />
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[10px] opacity-0 transition-opacity group-hover/tt:opacity-100"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
      >
        {label}
      </span>
    </span>
  );
}
