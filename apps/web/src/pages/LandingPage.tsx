import { useState } from 'react'
import { useReducedMotion } from 'motion/react'

import { useAuth } from '@/features/auth/useAuth'
import { CinematicIntro } from '@/features/landing/CinematicIntro'
import { ClosingCall } from '@/features/landing/ClosingCall'
import { LandingFooter } from '@/features/landing/LandingFooter'
import { LoopEngine } from '@/features/landing/LoopEngine'
import { Manifesto } from '@/features/landing/Manifesto'
import { TideField } from '@/features/landing/TideField'
import { ToolBento } from '@/features/landing/ToolBento'
import { TrustSection } from '@/features/landing/TrustSection'
import { WaveHero } from '@/features/landing/WaveHero'

// Dark landing: a skippable opening sequence on each guest visit, then the
// brand word over the tide map, filling with liquid as it scrolls, followed
// by the story: why it exists,
// the loop behind every pick, the tools, the rules it runs by, and a closing
// line that fills with the same liquid.
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
      <TideField />
      <main
        className="relative z-10 flex-1 overflow-x-clip text-white"
        data-accent="sky"
        id="main-content"
      >
        <WaveHero />
        <Manifesto />
        <LoopEngine />
        <ToolBento />
        <TrustSection />
        <ClosingCall />
      </main>
      <div className="relative z-10 bg-[#0a0a0b]/80">
        <LandingFooter />
      </div>
    </>
  )
}

export default LandingPage
