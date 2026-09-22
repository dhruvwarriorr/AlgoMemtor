const introSeenKey = 'algomemtor-intro-seen'

// The cinematic intro plays once per browser tab.
export function hasSeenIntro() {
  try {
    return sessionStorage.getItem(introSeenKey) === '1'
  } catch {
    return true
  }
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(introSeenKey, '1')
  } catch {
    // Without storage the intro may play again next visit; that is fine.
  }
}
