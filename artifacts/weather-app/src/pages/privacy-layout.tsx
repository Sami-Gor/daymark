import { type ReactNode, useEffect } from 'react';
import { Link } from 'wouter';
import { CloudSun } from 'lucide-react';

/*
 * Shared chrome for the public privacy policy pages. Each language owns its
 * full policy text; this layout only provides the brand header, the visible
 * language switcher (plain links, so every language has its own permanent
 * URL), the effective date line, and the footer.
 */

export type PolicyLang = 'en' | 'fr' | 'es';

const LANGUAGE_LINKS: { code: PolicyLang; label: string; href: string }[] = [
  { code: 'en', label: 'English', href: '/privacy' },
  { code: 'fr', label: 'Français', href: '/fr/privacy' },
  { code: 'es', label: 'Español', href: '/es/privacy' },
];

export function PrivacyPolicyLayout({
  lang,
  documentTitle,
  title,
  brandNote,
  backLabel,
  switcherLabel,
  effectiveText,
  tagline,
  children,
}: {
  lang: PolicyLang;
  documentTitle: string;
  title: string;
  brandNote: string;
  backLabel: string;
  switcherLabel: string;
  effectiveText: string;
  tagline: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = documentTitle;
    return () => {
      document.title = 'Daymark — weather, simply';
    };
  }, [documentTitle]);

  return (
    <div className="weather-app">
      <div className="app-shell privacy-shell">
        <header className="privacy-topbar">
          <div className="brand">
            <div className="brand-mark"><CloudSun size={21} strokeWidth={1.8} /></div>
            <div><div className="brand-name">daymark</div><div className="brand-note">{brandNote}</div></div>
          </div>
          <Link href="/" className="local-button privacy-back" data-testid="link-back-home">{backLabel}</Link>
        </header>

        <article className="privacy-policy" lang={lang} data-testid="page-privacy" data-lang={lang}>
          <h1 data-testid="text-privacy-heading">{title}</h1>
          <p className="privacy-effective" data-testid="text-privacy-effective">{effectiveText}</p>
          <nav className="privacy-langs" aria-label={switcherLabel} data-testid="privacy-language-switcher">
            {LANGUAGE_LINKS.map(({ code, label, href }) => (
              <Link
                key={code}
                href={href}
                className={`privacy-lang${code === lang ? ' active' : ''}`}
                aria-current={code === lang ? 'page' : undefined}
                data-testid={`link-privacy-lang-${code}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          {children}
        </article>

        <footer className="footer-note">
          <span>{tagline}</span>
          <span className="footer-links">
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">open-meteo.com</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
