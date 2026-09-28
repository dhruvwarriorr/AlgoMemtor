import { LogoMark } from '@/components/brand/LogoMark'
import { Wordmark } from '@/components/brand/Wordmark'

export function LandingFooter() {
  return (
    <footer className="border-t border-white/8 px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 text-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <LogoMark className="size-8" />
          <Wordmark className="text-base [--wave-base:#ffffff]" />
        </div>
        <p className="text-white/35">© 2026 AlgoMemtor</p>
      </div>
    </footer>
  )
}
