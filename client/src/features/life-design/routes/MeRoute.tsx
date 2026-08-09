import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Pencil, X } from 'lucide-react';
import { Button, useToastContext } from '@librechat/client';
import type {
  LifeBirthDraftField,
  LifeDossierAction,
  LifeDossierSection,
  LifeSelfProjectionItem,
} from 'librechat-data-provider';
import BasicsForm from '../components/BasicsForm';
import { LifeError, LifeLoading } from '../components/PageState';
import { useLifeDossierAnnotateMutation, useLifeSelfProjectionQuery } from '~/data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const ANNOTATABLE_SECTIONS = new Set<LifeDossierSection>([
  'chapters',
  'scenes',
  'traits',
  'tensions',
  'language',
]);

const SECTION_KEYS: Record<LifeSelfProjectionItem['section'], TranslationKeys> = {
  chapters: 'com_life_me_section_chapters',
  scenes: 'com_life_me_section_scenes',
  traits: 'com_life_me_section_traits',
  tensions: 'com_life_me_section_tensions',
  language: 'com_life_me_section_language',
  blindspots: 'com_life_me_section_blindspots',
};

const STATUS_KEYS: Record<LifeSelfProjectionItem['status'], TranslationKeys> = {
  confirmed: 'com_life_me_status_confirmed',
  user_rewrite: 'com_life_me_status_rewrite',
  pending: 'com_life_me_status_pending',
};

const BIRTH_LABEL_KEYS = {
  sun: 'com_life_me_birth_sun',
  moon: 'com_life_me_birth_moon',
  rising: 'com_life_me_birth_rising',
} as const satisfies Record<string, TranslationKeys>;

function dossierEntryId(item: LifeSelfProjectionItem): string | null {
  if (!ANNOTATABLE_SECTIONS.has(item.section as LifeDossierSection)) return null;
  const prefix = `dossier:${item.section}:`;
  return item.id.startsWith(prefix) ? item.id.slice(prefix.length) : null;
}

function ProjectionItem({ item }: { item: LifeSelfProjectionItem }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const annotate = useLifeDossierAnnotateMutation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const entryId = dossierEntryId(item);

  const submit = (action: LifeDossierAction) => {
    if (!entryId || annotate.isLoading) return;
    annotate.mutate(
      {
        section: item.section as LifeDossierSection,
        entryId,
        action,
        ...(action === 'rewrite' ? { text: text.trim() } : {}),
      },
      {
        onSuccess: () => {
          setEditing(false);
          showToast({ message: localize('com_life_me_revision_saved'), status: 'success' });
        },
        onError: () =>
          showToast({ message: localize('com_life_me_revision_failed'), status: 'error' }),
      },
    );
  };

  return (
    <article className="border-t border-life-rule py-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-life-mono text-life-meta tracking-[0.12em]">
        <span className="text-life-moss">{localize(STATUS_KEYS[item.status])}</span>
        <span className="text-life-muted">{localize(SECTION_KEYS[item.section])}</span>
      </div>
      {editing ? (
        <div className="mt-3">
          <label className="grid gap-2">
            <span className="font-life-sans text-life-sm text-life-muted">
              {localize('com_life_me_rewrite_label')}
            </span>
            <textarea
              value={text}
              maxLength={600}
              rows={4}
              onChange={(event) => setText(event.target.value)}
              className="w-full resize-y rounded-[3px] border border-life-ink bg-life-paper px-3 py-2 font-life-kai text-life-body leading-8 text-life-ink outline-none focus:border-life-cinnabar"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={!text.trim() || annotate.isLoading}
              onClick={() => submit('rewrite')}
              className="min-h-11 rounded-[4px] bg-life-moss px-4 font-life-sans text-life-sm text-life-paper hover:bg-life-moss-deep"
            >
              {localize('com_life_me_save_rewrite')}
            </Button>
            <Button
              type="button"
              disabled={annotate.isLoading}
              onClick={() => {
                setText(item.text);
                setEditing(false);
              }}
              className="min-h-11 rounded-[4px] border border-life-rule bg-transparent px-4 font-life-sans text-life-sm text-life-ink hover:border-life-ink"
            >
              {localize('com_life_cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 max-w-[34em] font-life-kai text-life-body leading-8 text-life-ink">
          {item.text}
        </p>
      )}

      {!editing && entryId && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {item.status === 'pending' && (
            <button
              type="button"
              disabled={annotate.isLoading}
              onClick={() => submit('keep')}
              className="inline-flex min-h-11 items-center font-life-sans text-life-sm text-life-moss hover:text-life-ink disabled:opacity-50"
            >
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {localize('com_life_me_like_me')}
            </button>
          )}
          <button
            type="button"
            disabled={annotate.isLoading}
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center font-life-sans text-life-sm text-life-brass hover:text-life-ink disabled:opacity-50"
          >
            <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {localize('com_life_me_rewrite')}
          </button>
          <button
            type="button"
            disabled={annotate.isLoading}
            onClick={() => submit('strike')}
            className="inline-flex min-h-11 items-center font-life-sans text-life-sm text-life-cinnabar hover:text-life-ink disabled:opacity-50"
          >
            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {localize('com_life_me_not_me')}
          </button>
        </div>
      )}
    </article>
  );
}

function BirthField({ label, field }: { label: TranslationKeys; field: LifeBirthDraftField }) {
  const localize = useLocalize();
  let value = localize('com_life_me_birth_unavailable');
  let certainty = localize('com_life_me_birth_certainty_unavailable');
  if (field.certainty === 'exact') {
    value = field.sign ? `${field.sign}／${field.name}` : field.name;
    certainty = localize('com_life_me_birth_certainty_exact');
  } else if (field.certainty === 'candidate') {
    value = field.candidates.join(' · ');
    certainty = localize('com_life_me_birth_certainty_candidate');
  }
  return (
    <div className="grid gap-3 border-t border-life-rule py-4 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-baseline">
      <p className="font-life-serif text-life-lead font-semibold">{localize(label)}</p>
      <div>
        <p className="font-life-sans text-life-body text-life-ink">{value}</p>
        <p className="mt-1 font-life-kai text-life-sm leading-7 text-life-muted">{field.meaning}</p>
      </div>
      <p className="font-life-mono text-life-meta tracking-[0.1em] text-life-brass">{certainty}</p>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-6">
      <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss">{eyebrow}</p>
      <h2 className="mt-3 font-life-serif text-life-title font-semibold leading-tight">{title}</h2>
    </header>
  );
}

export default function MeRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const query = useLifeSelfProjectionQuery();

  useEffect(() => {
    if (!query.data || window.location.hash !== '#me-basics') return;
    window.requestAnimationFrame(() => {
      document.getElementById('me-basics')?.scrollIntoView({ block: 'start' });
    });
  }, [query.data]);

  if (query.isLoading) {
    return <LifeLoading />;
  }
  if (query.isError || !query.data) {
    return (
      <LifeError
        title={localize('com_life_me_unavailable')}
        message={localize('com_life_me_unavailable_help')}
        onRetry={() => query.refetch()}
        onContinue={() => navigate('/c/new')}
      />
    );
  }

  const { projection, availability } = query.data;
  const confirmed = projection.confirmed.filter((item) => item.section !== 'tensions');
  const hasReality = Boolean(
    projection.selfFormula ||
      projection.currentState ||
      projection.coreTensions.length ||
      confirmed.length ||
      projection.pending.length,
  );
  const hasBirth =
    projection.birthDraft.status !== 'unavailable' ||
    availability.birthDraft === 'temporarily_unavailable';

  let birthContent;
  if (availability.birthDraft === 'temporarily_unavailable') {
    birthContent = (
      <p
        role="status"
        className="max-w-[34em] font-life-kai text-life-body leading-8 text-life-muted"
      >
        {localize('com_life_me_birth_temporarily_unavailable')}
      </p>
    );
  } else if (hasBirth) {
    birthContent = (
      <>
        {projection.birthDraft.formula && (
          <blockquote className="mb-7 max-w-[30em] border-l-2 border-life-brass pl-5 font-life-serif text-life-lead font-semibold leading-[1.7]">
            {projection.birthDraft.formula}
          </blockquote>
        )}
        <div className="border-b border-life-rule">
          <BirthField label={BIRTH_LABEL_KEYS.sun} field={projection.birthDraft.sun} />
          <BirthField label={BIRTH_LABEL_KEYS.moon} field={projection.birthDraft.moon} />
          <BirthField label={BIRTH_LABEL_KEYS.rising} field={projection.birthDraft.rising} />
        </div>
        <p className="mt-5 max-w-[34em] font-life-kai text-life-sm leading-7 text-life-muted">
          {projection.birthDraft.status === 'complete'
            ? localize('com_life_me_birth_complete_help')
            : localize('com_life_me_birth_partial_help')}
        </p>
      </>
    );
  } else {
    birthContent = (
      <div className="max-w-[34em] border-l-2 border-life-rule pl-5">
        <p className="font-life-kai text-life-body leading-8 text-life-muted">
          {localize('com_life_me_birth_empty')}
        </p>
        <a
          href="#me-basics"
          className="mt-3 inline-flex min-h-11 items-center border-b border-life-moss font-life-sans text-life-sm font-medium text-life-moss hover:text-life-ink"
        >
          {localize('com_life_me_add_birth')}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    );
  }

  const birthSection = (
    <section className="border-t border-life-ink/70 py-10 sm:py-12" id="me-birth">
      <SectionTitle
        eyebrow={localize('com_life_me_birth_eyebrow')}
        title={localize('com_life_me_birth_title')}
      />
      {birthContent}
    </section>
  );

  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink">
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        <header className="max-w-4xl border-b border-life-ink/70 pb-8">
          <p className="font-life-mono text-life-meta tracking-[0.22em] text-life-cinnabar">
            {localize('com_life_me_eyebrow')}
          </p>
          <h1 className="mt-4 font-life-serif text-life-title font-black leading-tight sm:text-life-display">
            {localize('com_life_me_title')}
          </h1>
          <p className="mt-5 max-w-[34em] font-life-sans text-life-body leading-8 text-life-muted">
            {localize('com_life_me_description')}
          </p>
          <p className="mt-4 max-w-[34em] border-l-2 border-life-cinnabar pl-4 font-life-kai text-life-sm leading-7 text-life-muted">
            {localize('com_life_me_not_assessment')}
          </p>
        </header>

        {!hasReality && !hasBirth ? (
          <section className="py-10 sm:py-12" aria-labelledby="me-empty-title">
            <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss">
              {localize('com_life_me_empty_eyebrow')}
            </p>
            <h2 id="me-empty-title" className="mt-3 font-life-serif text-life-title font-semibold">
              {localize('com_life_me_empty_title')}
            </h2>
            <p className="mt-4 max-w-[34em] font-life-kai text-life-body leading-8 text-life-muted">
              {localize('com_life_me_empty_help')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/c/new"
                className="inline-flex min-h-12 items-center rounded-[4px] bg-life-moss px-5 font-life-sans text-life-sm font-medium text-life-paper hover:bg-life-moss-deep"
              >
                {localize('com_life_me_direct_chat')}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#me-basics"
                className="inline-flex min-h-12 items-center rounded-[4px] border border-life-rule px-5 font-life-sans text-life-sm font-medium text-life-ink hover:border-life-ink"
              >
                {localize('com_life_me_add_birth')}
              </a>
            </div>
          </section>
        ) : (
          <>
            {!hasReality && birthSection}
            {projection.selfFormula && (
              <section className="py-10 sm:py-12">
                <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss">
                  {projection.selfFormula.basis === 'user_rewrite'
                    ? localize('com_life_me_formula_rewritten')
                    : localize('com_life_me_formula_confirmed')}
                </p>
                <blockquote className="mt-4 max-w-[30em] font-life-serif text-life-title font-semibold leading-[1.75]">
                  <span className="mr-2 text-life-cinnabar">“</span>
                  {projection.selfFormula.text}
                  <span className="ml-1 text-life-cinnabar">”</span>
                </blockquote>
              </section>
            )}
            {projection.currentState && (
              <section className="border-t border-life-ink/70 py-10 sm:py-12">
                <SectionTitle
                  eyebrow={localize('com_life_me_current_eyebrow')}
                  title={localize('com_life_me_current_title')}
                />
                <p className="max-w-[34em] font-life-kai text-life-lead leading-9">
                  {projection.currentState.text}
                </p>
              </section>
            )}
            {projection.coreTensions.length > 0 && (
              <section className="border-t border-life-ink/70 py-10 sm:py-12">
                <SectionTitle
                  eyebrow={localize('com_life_me_tensions_eyebrow')}
                  title={localize('com_life_me_tensions_title')}
                />
                {projection.coreTensions.map((item) => (
                  <ProjectionItem key={item.id} item={item} />
                ))}
              </section>
            )}
            {confirmed.length > 0 && (
              <section className="border-t border-life-ink/70 py-10 sm:py-12">
                <SectionTitle
                  eyebrow={localize('com_life_me_confirmed_eyebrow')}
                  title={localize('com_life_me_confirmed_title')}
                />
                {confirmed.map((item) => (
                  <ProjectionItem key={item.id} item={item} />
                ))}
              </section>
            )}
            {projection.pending.length > 0 && (
              <section className="border-t border-life-ink/70 py-10 sm:py-12">
                <SectionTitle
                  eyebrow={localize('com_life_me_pending_eyebrow')}
                  title={localize('com_life_me_pending_title')}
                />
                <p className="mb-6 max-w-[34em] font-life-kai text-life-sm leading-7 text-life-muted">
                  {localize('com_life_me_pending_help')}
                </p>
                {projection.pending.map((item) => (
                  <ProjectionItem key={item.id} item={item} />
                ))}
              </section>
            )}
            {hasReality && birthSection}
          </>
        )}

        <section id="me-basics" className="scroll-mt-6 border-t border-life-ink/70 py-10 sm:py-12">
          <SectionTitle
            eyebrow={localize('com_life_me_basics_eyebrow')}
            title={localize('com_life_me_basics_title')}
          />
          <BasicsForm />
        </section>

        <section className="border-t border-life-ink/70 py-10 sm:py-12">
          <SectionTitle
            eyebrow={localize('com_life_me_archive_eyebrow')}
            title={localize('com_life_me_archive_title')}
          />
          <p className="max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted">
            {localize('com_life_me_archive_help')}
          </p>
          <Link
            to="/archive"
            className="mt-5 inline-flex min-h-11 items-center border-b border-life-moss font-life-sans text-life-sm font-medium text-life-moss hover:text-life-ink"
          >
            {localize('com_life_me_open_archive')}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  );
}
