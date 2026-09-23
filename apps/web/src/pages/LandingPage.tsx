import { useState } from 'react'
import { useReducedMotion } from 'motion/react'

import { useAuth } from '@/features/auth/useAuth'
import { CinematicIntro } from '@/features/landing/CinematicIntro'
import { LandingFooter } from '@/features/landing/LandingFooter'
import { WaveHero } from '@/features/landing/WaveHero'
import { WaveField } from '@/features/landing/WaveField'

// Dark landing: a skippable opening sequence on each guest visit, then one
// pinned scene over the wave field where the brand word fills with liquid
// and scatters and the big orbiting logo takes its place. The top bar
// carries the one action.
function LandingPage() {
  const { status } = useAuth()
  const reduceMotion = useReducedMotion()
  const [introDone, setIntroDone] = useState(false)
  const showIntro = status === 'unauthenticated' && !introDone && !reduceMotion

  return (
    <>
      {showIntro ? (
        <CinematicIntro onComplete={() => setIntroDone(true)} />
      ) : null}
      <WaveField />
      <main
        className="relative z-10 flex-1 overflow-x-clip text-white"
        id="main-content"
      >
        <WaveHero />
      </main>
      <div className="relative z-10 bg-[#0a0a0b]/80">
        <LandingFooter />
      </div>
    </>
  )
}

export default LandingPage
