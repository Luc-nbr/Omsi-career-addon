import type { JSX } from 'react'

/**
 * Het venster dat over het scherm komt als je een stap verder gaat, met een bus
 * die oversteekt.
 *
 * WAAROM DIT EEN EIGEN BESTAND IS
 * Hij hoorde eerst in het stappenvel, en daar werkte hij niet: bij sommige
 * stappen wisselt het scherm van tak -- van de modus naar het klaarzetten
 * bijvoorbeeld -- en dan bouwt React het vel opnieuw op. Alles wat dat vel zich
 * herinnerde is dan weg, dus ook de rijdende bus. Hier staat hij boven dat
 * alles, in het scherm zelf, en overleeft hij de stap waar hij bij hoort.
 *
 * Het is met opzet een dekkend venster en geen bus die over de knoppen schuift:
 * zo zie je het ene scherm niet half door het andere heen terwijl de stap
 * wisselt. Het venster komt op, de bus rijdt erdoorheen, het venster gaat weer
 * weg -- bij elkaar achttiende van een seconde meer dan de rit zelf. Zolang het
 * er staat vangt het de muis, want klikken op iets wat je niet ziet hoort niet
 * te werken. Wie beweging in Windows heeft uitgezet ziet het niet; zie
 * `setup.css`.
 */
export function Busrit({ opKlaar }: { opKlaar: () => void }): JSX.Element {
  return (
    <div
      className="busvenster"
      aria-hidden="true"
      /*
       * Alleen de animatie van het venster zelf telt. Zonder deze toets ruimde
       * het afscheidsbericht van de bus -- dat naar boven doorborrelt -- het
       * venster al op voordat hij de overkant had gehaald; gemeten kwam hij dan
       * niet verder dan x=-44, nog buiten beeld.
       */
      onAnimationEnd={(e) => {
        if (e.animationName === 'venster-schuift-langs') opKlaar()
      }}
    >
      <span className="busrit">
        <svg className="busicoon" viewBox="0 0 96 40">
          <rect x="2" y="8" width="92" height="22" rx="4" />
          <line x1="70" y1="8" x2="70" y2="30" />
          <circle cx="20" cy="32" r="4" />
          <circle cx="76" cy="32" r="4" />
        </svg>
      </span>
      <span className="busvenster-weg" />
    </div>
  )
}
