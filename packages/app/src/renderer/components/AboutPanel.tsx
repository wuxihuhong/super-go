import { useEffect, useRef, useState } from 'react';
import { ABOUT_EMAIL, ABOUT_GITHUB, ABOUT_LICENSE_URL } from '@shared/about';
import type { TFunction } from '../i18n';
import { AppMark } from './AppMark';

export interface AboutPanelProps {
  t: TFunction;
  onClose: () => void;
}

function AboutLink(props: { href: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => window.superGo.openExternal(props.href)}
      className="text-left text-xs text-accent underline-offset-2 transition-colors hover:underline"
    >
      {props.children}
    </button>
  );
}

export default function AboutPanel(props: AboutPanelProps): React.JSX.Element {
  const [version, setVersion] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.superGo.getAppInfo().then((info) => setVersion(info.versions.app));
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-labelledby="about-title"
      tabIndex={-1}
      className="sg-popover w-80 select-none rounded-xl p-5 text-foreground outline-none"
    >
      <div className="flex flex-col items-center text-center">
        <AppMark className="h-[72px] w-[72px]" />
        <h2 id="about-title" className="mt-3 text-sm font-semibold">
          {props.t('app.name')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{props.t('app.tagline')}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{props.t('about.games')}</p>
        {version !== '' && (
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            {props.t('about.version').replace('{v}', version)}
          </p>
        )}
      </div>

      <dl className="mt-4 space-y-2.5 border-t border-border pt-3 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">{props.t('about.contact')}</dt>
          <dd className="min-w-0 text-right">
            <AboutLink href={`mailto:${ABOUT_EMAIL}`}>{ABOUT_EMAIL}</AboutLink>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">{props.t('about.github')}</dt>
          <dd className="min-w-0 text-right">
            <AboutLink href={ABOUT_GITHUB}>github.com/wuxihuhong/super-go</AboutLink>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">{props.t('about.license')}</dt>
          <dd className="min-w-0 text-right">
            <AboutLink href={ABOUT_LICENSE_URL}>{props.t('about.license.name')}</AboutLink>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {props.t('about.license.note')}
      </p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={props.onClose}
          className="select-none rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          {props.t('about.close')}
        </button>
      </div>
    </div>
  );
}
