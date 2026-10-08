'use client';

/** Reusable primitives styled from the OHB design system (globals.css). */

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { ReportStatus, ReportDefinitionStatus } from '@ohb/shared';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  size,
  block,
  className,
  children,
  ...rest
}: {
  variant?: Variant;
  size?: 'sm';
  block?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <div className="field__error">{error}</div>
      ) : hint ? (
        <div className="field__hint">{hint}</div>
      ) : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="select" {...props}>
      {children}
    </select>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

export function Card({
  title,
  desc,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['card', className ?? ''].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <div className="builder-section__head" style={{ marginBottom: desc ? 4 : 16 }}>
          {title && <h2 className="card__title">{title}</h2>}
          {actions && <div className="toolbar">{actions}</div>}
        </div>
      )}
      {desc && <div className="card__desc">{desc}</div>}
      {children}
    </div>
  );
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({
  tone = 'slate',
  children,
}: {
  tone?: 'green' | 'amber' | 'red' | 'slate';
  children: ReactNode;
}) {
  return (
    <span className={`pill pill--${tone}`}>
      <span className="pill__dot" />
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ReportStatus, 'green' | 'amber' | 'red' | 'slate'> = {
  [ReportStatus.DRAFT]: 'slate',
  [ReportStatus.SUBMITTED]: 'amber',
  [ReportStatus.UNDER_REVIEW]: 'amber',
  [ReportStatus.REVISION_REQUIRED]: 'red',
  [ReportStatus.RESUBMITTED]: 'amber',
  [ReportStatus.APPROVED]: 'green',
};

const STATUS_LABEL: Record<ReportStatus, string> = {
  [ReportStatus.DRAFT]: 'Draft',
  [ReportStatus.SUBMITTED]: 'Submitted',
  [ReportStatus.UNDER_REVIEW]: 'Under review',
  [ReportStatus.REVISION_REQUIRED]: 'Revision required',
  [ReportStatus.RESUBMITTED]: 'Resubmitted',
  [ReportStatus.APPROVED]: 'Approved',
};

export function StatusPill({ status }: { status: ReportStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

const DEF_TONE: Record<ReportDefinitionStatus, 'green' | 'amber' | 'slate'> = {
  [ReportDefinitionStatus.DRAFT]: 'amber',
  [ReportDefinitionStatus.PUBLISHED]: 'green',
  [ReportDefinitionStatus.ARCHIVED]: 'slate',
};

export function DefinitionStatusPill({ status }: { status: ReportDefinitionStatus }) {
  return <Pill tone={DEF_TONE[status]}>{status.toLowerCase()}</Pill>;
}

export function Callout({
  title,
  children,
  tone = 'default',
}: {
  title?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  const Icon = tone === 'danger' ? AlertTriangle : Info;
  return (
    <div className={['callout', tone === 'danger' ? 'callout--danger' : ''].join(' ')}>
      <Icon className="callout__icon" size={18} />
      <div>
        {title && <div className="callout__title">{title}</div>}
        <div className="callout__body">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

/**
 * The Oromia Health Bureau logo mark. Rendered as the brand badge in the
 * header and on the auth cards. The source lives in `public/logo.png`.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="brand__mark" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Oromia Health Bureau logo" width={size} height={size} />
    </span>
  );
}

/** Derives up-to-two uppercase initials from a display name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Circular profile picture. Shows the image when `src` is set, otherwise a
 * tinted monogram of the user's initials. `size` is the diameter in pixels.
 */
export function Avatar({
  name,
  src,
  size = 40,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden={false}
      role="img"
      aria-label={`${name} profile picture`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} />
      ) : (
        <span className="avatar__initials">{initialsOf(name)}</span>
      )}
    </span>
  );
}
