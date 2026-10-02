import { useEffect, type ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'outline';

const VARIANTS: Record<BtnVariant, string> = {
  primary: 'bg-accent text-on-accent font-semibold hover:bg-accent-hover border border-transparent',
  secondary: 'bg-card text-text border border-line-strong hover:bg-panel',
  ghost: 'bg-transparent text-text-2 border border-transparent hover:bg-panel-2',
  inverse: 'bg-inverse text-on-inverse font-semibold border border-transparent hover:opacity-90',
  outline: 'bg-transparent text-text font-semibold border border-inverse hover:bg-inverse hover:text-on-inverse',
};

export function Button({ variant = 'secondary', className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button {...rest} className={cx('inline-flex items-center justify-center gap-2 rounded-[9px] px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-40 disabled:pointer-events-none', VARIANTS[variant], className)}>
      {children}
    </button>
  );
}

export function Group({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 border-t border-line px-5 pt-4 pb-[18px]">
      <div className="flex items-center justify-between">
        <div className="eyebrow">{title}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Info({ children }: { children: ReactNode }) {
  return <div className="text-[12.5px] leading-normal text-text-2 text-pretty">{children}</div>;
}

export function Toggle({ label, value, onChange, disabled }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 bg-transparent p-0 text-left text-[13.5px] text-text disabled:opacity-40">
      <span>{label}</span>
      <span className={cx('relative h-5 w-[34px] flex-none rounded-full transition-colors', value ? 'bg-accent' : 'bg-line-x')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-[left]', value ? 'left-4' : 'left-0.5')} />
      </span>
    </button>
  );
}

export function Slider({ label, value, min, max, step, format, onChange }: {
  label: ReactNode; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[13.5px]">
        <span>{label}</span>
        <span className="num text-[12.5px] font-medium text-text-2">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label?: ReactNode; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-[7px]">
      {label && <span className="text-[13.5px]">{label}</span>}
      <div className="flex gap-0.5 rounded-[9px] bg-panel-2 p-0.5" role="radiogroup">
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={cx('h-[30px] flex-1 rounded-[7px] border-0 text-[12.5px] transition-colors',
              value === v ? 'bg-card font-semibold text-text shadow-[0_1px_3px_rgba(0,0,0,.15)]' : 'bg-transparent text-text-2 hover:text-text')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Swatches({ label, value, colors, onChange }: { label: ReactNode; value: string; colors: string[]; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13.5px]">{label}</span>
      <div className="flex flex-wrap gap-2.5">
        {colors.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} style={{ background: c }}
            className={cx('h-7 w-7 rounded-full p-0', value.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-inverse ring-offset-2 ring-offset-panel' : 'border border-line-x')} />
        ))}
        <label className="relative grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-dashed border-line-x text-[13px] text-muted" title="Custom colour">
          +
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  );
}

export function Cards<T extends string>({ label, value, options, onChange }: {
  label: ReactNode; value: T; options: { id: T; label: string; preview: ReactNode; previewStyle?: React.CSSProperties }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13.5px]">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(o.id)}
            className={cx('flex flex-col gap-[5px] rounded-[10px] border-[1.5px] p-1 pb-1.5 text-[12px]', value === o.id ? 'border-accent bg-card' : 'border-transparent bg-transparent hover:bg-panel-2')}>
            <span className="grid h-[38px] place-items-center rounded-[7px] text-[15px]" style={o.previewStyle}>{o.preview}</span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, autoFocus }: { label: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13.5px]">
      {label}
      <input value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)}
        className="h-[38px] rounded-[9px] border border-line-strong bg-card px-[11px] text-[14px] text-text outline-none focus:border-accent" />
    </label>
  );
}

export function Modal({ title, children, onClose, width = 480 }: { title: ReactNode; children: ReactNode; onClose?: () => void; width?: number }) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-(--scrim)" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div role="dialog" aria-modal className="flex max-h-[92vh] max-w-[92vw] flex-col gap-5 overflow-auto rounded-2xl border border-line bg-bg p-7 shadow-[0_24px_80px_rgba(0,0,0,.3)]" style={{ width }}>
        <div className="text-[22px] font-semibold tracking-[-0.015em]">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function PillChoice<T extends string>({ value, options, onChange, mono }: { value: T; options: [T, string][]; onChange: (v: T) => void; mono?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={cx('h-[38px] flex-1 rounded-[9px] px-3.5 text-[13px] font-medium', mono && 'num',
            value === v ? 'border border-inverse bg-inverse text-on-inverse' : 'border border-line-strong bg-card text-text hover:bg-panel')}>
          {l}
        </button>
      ))}
    </div>
  );
}
