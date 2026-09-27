import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'

import { Lock } from '@/components/icons/algo-icons'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import { inputClass } from '@/features/mentor/format'
import { cn } from '@/lib/utils'

import { CodeEditor } from '../components/CodeEditor'
import { PlayIcon } from '../components/player-icons'
import {
  edgeCaseIdeas,
  exampleCategories,
  exampleLanguages,
  examplePrograms,
  type ExampleCategory,
  type ExampleProgram,
} from '../examples'
import { CODE_LIMIT, INPUT_LIMIT } from '../handoff'
import {
  defaultTraceLimits,
  visualizerLanguageLabels,
  type VisualizerLanguage,
} from '../trace'
import { ExampleThumb } from './ExampleThumb'
import { TracePreview } from './TracePreview'

const visualizerLanguages: readonly VisualizerLanguage[] = [
  'cpp',
  'java',
  'python',
]

export function LanguagePicker({
  value,
  onChange,
  available = visualizerLanguages,
  size = 'md',
}: {
  value: VisualizerLanguage
  onChange: (language: VisualizerLanguage) => void
  available?: readonly VisualizerLanguage[]
  size?: 'sm' | 'md'
}) {
  return (
    <div
      aria-label="Language"
      className="inline-flex rounded-xl border border-border bg-secondary/50 p-1"
      role="radiogroup"
    >
      {visualizerLanguages.map((choice) => {
        const enabled = available.includes(choice)
        return (
          <button
            aria-checked={value === choice}
            className={cn(
              'relative rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-sm',
              value === choice
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            disabled={!enabled}
            key={choice}
            onClick={() => onChange(choice)}
            role="radio"
            type="button"
          >
            {value === choice ? (
              <motion.span
                className="absolute inset-0 rounded-lg bg-card shadow-soft"
                layoutId={`language-${size}`}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            ) : null}
            <span className="relative">{visualizerLanguageLabels[choice]}</span>
          </button>
        )
      })}
    </div>
  )
}

function ExampleCard({
  program,
  language,
  onOpen,
  index,
}: {
  program: ExampleProgram
  language: VisualizerLanguage
  onOpen: (program: ExampleProgram, language: VisualizerLanguage) => void
  index: number
}) {
  const languages = exampleLanguages(program)
  const chosen = languages.includes(language)
    ? language
    : (languages[0] ?? 'cpp')
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="min-w-0"
      initial={{ opacity: 0, y: 10 }}
      layout
      transition={{ delay: Math.min(index, 12) * 0.03 }}
    >
      <button
        className={cn(
          'group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          program.bug === true ? 'border-destructive/25' : 'border-border',
        )}
        onClick={() => onOpen(program, chosen)}
        type="button"
      >
        <div
          className={cn(
            'relative h-24 w-full border-b border-border px-6 py-3',
            program.bug === true
              ? 'bg-gradient-to-br from-danger-soft/70 to-card'
              : 'bg-gradient-to-br from-sky-soft to-go-soft/40',
          )}
        >
          <ExampleThumb visual={program.visual} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-3.5">
          <span className="text-sm font-semibold text-foreground group-hover:text-primary">
            {program.title}
          </span>
          <span className="text-xs leading-5 text-muted-foreground">
            {program.blurb}
          </span>
          <span className="mt-auto flex flex-wrap gap-1 pt-1.5">
            {languages.map((item) => (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                  item === chosen
                    ? 'bg-primary/12 text-primary'
                    : 'bg-secondary text-muted-foreground',
                )}
                key={item}
              >
                {visualizerLanguageLabels[item]}
              </span>
            ))}
          </span>
        </div>
      </button>
    </motion.li>
  )
}

export function ExampleGallery({
  language,
  onLanguage,
  onOpen,
  compact = false,
}: {
  language: VisualizerLanguage
  onLanguage: (language: VisualizerLanguage) => void
  onOpen: (program: ExampleProgram, language: VisualizerLanguage) => void
  compact?: boolean
}) {
  const [category, setCategory] = useState<ExampleCategory | 'all'>('all')
  const shown = examplePrograms.filter(
    (program) => category === 'all' || program.category === category,
  )
  return (
    <section
      aria-labelledby="examples-heading"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold text-foreground"
            id="examples-heading"
          >
            Examples
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick one to watch a classic algorithm run, then press Play.
          </p>
        </div>
        <LanguagePicker onChange={onLanguage} size="sm" value={language} />
      </div>
      <div
        aria-label="Topics"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="tablist"
      >
        {[{ id: 'all' as const, label: 'All' }, ...exampleCategories].map(
          (item) => (
            <button
              aria-selected={category === item.id}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                category === item.id
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-foreground/80 hover:bg-secondary',
              )}
              key={item.id}
              onClick={() => setCategory(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ),
        )}
      </div>
      <ul
        className={cn(
          'grid gap-3',
          compact
            ? 'sm:grid-cols-2'
            : 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
        )}
      >
        {shown.map((program, index) => (
          <ExampleCard
            index={index}
            key={program.id}
            language={language}
            onOpen={onOpen}
            program={program}
          />
        ))}
      </ul>
    </section>
  )
}

const placeholders: Record<VisualizerLanguage, string> = {
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n}',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        \n    }\n}',
  python: 'n = int(input())',
}

const languageHelp: Record<VisualizerLanguage, string> = {
  cpp: 'Contest C++: STL containers, strings, structs, pointers (new/delete, linked nodes), lambdas, recursion and macros.',
  java: 'Java 21 in one file: classes, interfaces, enums, records, generics, collections, Scanner/BufferedReader, exceptions and a Stream subset.',
  python: 'Real CPython 3.14 in your browser, with the standard library.',
}

export function CodeComposer({
  language,
  code,
  input,
  expected,
  runError,
  onLanguage,
  onCode,
  onInput,
  onExpected,
  onRun,
  onBack,
}: {
  language: VisualizerLanguage
  code: string
  input: string
  expected: string
  runError: string | null
  onLanguage: (language: VisualizerLanguage) => void
  onCode: (value: string) => void
  onInput: (value: string) => void
  onExpected: (value: string) => void
  onRun: (event: FormEvent) => void
  onBack?: () => void
}) {
  return (
    <form
      aria-labelledby="composer-heading"
      className="flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-soft"
      noValidate
      onKeyDown={(event) => {
        // Ctrl/Cmd + Enter runs from anywhere in the form.
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          event.currentTarget.requestSubmit()
        }
      }}
      onSubmit={onRun}
    >
      <h2 className="sr-only" id="composer-heading">
        Your code and test case
      </h2>
      <div className="sticky top-[var(--app-header)] z-20 flex min-w-0 flex-wrap items-center gap-2 rounded-t-2xl border-b border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <LanguagePicker onChange={onLanguage} value={language} />
        <span className="flex-1" />
        {onBack !== undefined ? (
          <Button onClick={onBack} type="button" variant="ghost">
            Back to the visualization
          </Button>
        ) : null}
        <span className="hidden text-xs text-muted-foreground md:inline">
          <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[11px]">
            Ctrl
          </kbd>{' '}
          +{' '}
          <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[11px]">
            Enter
          </kbd>
        </span>
        <Button type="submit">
          <PlayIcon aria-hidden="true" /> Run &amp; visualize
        </Button>
      </div>
      {runError !== null ? (
        <p
          className="mx-4 mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-foreground"
          role="alert"
        >
          {runError}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-5 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <CodeEditor
            describedBy="visualizer-code-help"
            id="visualizer-code"
            label="Code"
            maxLength={CODE_LIMIT}
            onChange={onCode}
            placeholder={placeholders[language]}
            value={code}
          />
          <p
            className="text-xs leading-5 text-muted-foreground"
            id="visualizer-code-help"
          >
            {languageHelp[language]} Tab indents; press Esc, then Tab, to leave
            the editor.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--app-header)+4.5rem)] lg:self-start">
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            Test input
            <textarea
              className={cn(inputClass, 'min-h-32 resize-y font-mono text-xs')}
              maxLength={INPUT_LIMIT}
              onChange={(event) => onInput(event.target.value)}
              placeholder="The exact input your program reads."
              spellCheck={false}
              value={input}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            <span>
              Expected output{' '}
              <span className="font-normal text-muted-foreground">
                (optional, recommended)
              </span>
            </span>
            <textarea
              className={cn(inputClass, 'min-h-20 resize-y font-mono text-xs')}
              maxLength={INPUT_LIMIT}
              onChange={(event) => onExpected(event.target.value)}
              placeholder="With the right answer, the visualizer marks the exact step where your output goes wrong."
              spellCheck={false}
              value={expected}
            />
          </label>
          <Disclosure
            contentClassName="px-3 pb-3"
            summary={
              <span className="text-xs text-muted-foreground">
                Edge cases worth trying
              </span>
            }
            summaryClassName="px-3 py-2"
          >
            <ul className="grid list-disc gap-1 pl-5 text-xs leading-5 text-muted-foreground">
              {edgeCaseIdeas.map((idea) => (
                <li key={idea}>{idea}</li>
              ))}
            </ul>
          </Disclosure>
          <p className="inline-flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Runs only in this browser tab. Up to{' '}
            {defaultTraceLimits.maxSteps.toLocaleString()} steps are recorded;
            runs stop after {defaultTraceLimits.timeMs / 1000} s.
          </p>
          {onBack === undefined ? (
            <div className="hidden lg:block">
              <TracePreview />
            </div>
          ) : null}
        </div>
      </div>
    </form>
  )
}
