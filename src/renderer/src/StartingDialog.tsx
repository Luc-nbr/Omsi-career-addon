import { useEffect, useState, type JSX } from 'react'
import { useT } from './language'

interface Props {
  /** Sluit vanzelf zodra de plugin meldt dat het spel er is. */
  onDone(): void
  onDismiss(): void
}

/**
 * Het venstertje tijdens het opstarten van OMSI.
 *
 * Het verdwijnt vanzelf zodra de plugin gegevens doorgeeft — dat is het moment
 * dat het spel er echt is. Er zit een sluitknop bij, want een venster dat je
 * niet weg kunt klikken is altijd verkeerd.
 */
export function StartingDialog({ onDone, onDismiss }: Props): JSX.Element {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const tick = setInterval(() => setSeconds((value) => value + 1), 1000)
    const poll = setInterval(() => {
      void window.career.liveConnected().then((connected) => {
        if (connected) onDone()
      })
    }, 1500)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [onDone])

  const tr = useT()

  return (
    <div className="backdrop">
      <section className="dialog">
        <div className="glow" />
        <h2>{tr('starting.title')}</h2>
        <p>{tr('starting.body')}</p>
        <div className="dialog-foot">
          <span className="note">
            {tr(
              seconds < 25
                ? 'starting.busy'
                : seconds < 60
                  ? 'starting.loading'
                  : 'starting.still'
            )}
            {seconds > 4 ? ` · ${seconds}s` : ''}
          </span>
          <button type="button" className="btn secondary" onClick={onDismiss}>
            {tr('starting.close')}
          </button>
        </div>
      </section>
    </div>
  )
}
