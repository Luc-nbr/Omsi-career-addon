import { useEffect, useState, type JSX } from 'react'

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

  return (
    <div className="backdrop">
      <section className="dialog">
        <div className="glow" />
        <h2>Moment geduld</h2>
        <p>
          OMSI 2 wordt opgestart. Net als een diesel heeft dit even tijd nodig om warm te worden —
          beheers uw emoties.
        </p>
        <div className="dialog-foot">
          <span className="note">
            {seconds < 25
              ? 'Bezig met opstarten…'
              : seconds < 60
                ? 'De kaart wordt ingeladen; dat duurt even.'
                : 'Nog steeds bezig. Grote kaarten nemen ruim de tijd.'}
            {seconds > 4 ? ` · ${seconds}s` : ''}
          </span>
          <button type="button" className="btn secondary" onClick={onDismiss}>
            Sluiten
          </button>
        </div>
      </section>
    </div>
  )
}
