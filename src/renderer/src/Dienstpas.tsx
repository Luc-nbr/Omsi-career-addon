import type { JSX } from "react";
import { useT } from "./language";

interface Props {
  chauffeur: string;
  personeelsnummer: string;
  pincode: string;
  onGezien: () => void;
  /** Brengt de chauffeur naar zijn staat van dienst, waar ze blijven staan. */
  onStaatVanDienst: () => void;
}

/**
 * De dienstpas: je personeelsnummer en je pincode, eenmaal in beeld.
 *
 * WAAROM DIT ER IS
 * De gegevens werden stilletjes aangemaakt bij het eerste profiel. Dat is op
 * zichzelf goed -- niemand hoort een nummer te moeten verzinnen -- maar het liet
 * de chauffeur achter met een cijferblok in de bus en geen idee wat hij moest
 * intoetsen. De gebruiker zei het zo: "ook kon ik nergens zien wat mijn code is
 * en waar ik die aanmaak". Dus laat de app het uit zichzelf zien, één keer, op
 * het moment dat er nog niets anders van je gevraagd wordt.
 *
 * WAAROM EENMAAL EN NIET ELKE START
 * Een venster dat elke keer opengaat, wordt een venster dat je wegklikt zonder
 * te lezen. Het staat daarna bij de staat van dienst, en deze knop brengt je er
 * meteen heen zodat je weet waar dat is.
 *
 * Er valt hier niets te beschermen: zie de toelichting bij `CareerState` in
 * `core/career.ts`. Daarom staan de cijfers gewoon in beeld en niet achter
 * puntjes -- ze overtypen op een cijferblok in een rijdende bus is al werk zat.
 */
export function Dienstpas({
  chauffeur,
  personeelsnummer,
  pincode,
  onGezien,
  onStaatVanDienst,
}: Props): JSX.Element {
  const tr = useT();
  return (
    <div className="backdrop">
      <section className="dialog dienstpas">
        <div className="glow" />
        <h2>{tr("pas.title")}</h2>
        <p>{tr("pas.body", { driver: chauffeur })}</p>

        <div className="pas-cijfers">
          <div>
            <span>{tr("prof.staffNumber")}</span>
            <b>{personeelsnummer}</b>
          </div>
          <div>
            <span>{tr("prof.pin")}</span>
            <b>{pincode}</b>
          </div>
        </div>

        <p>{tr("pas.where")}</p>

        <div className="dialog-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              onGezien();
              onStaatVanDienst();
            }}
          >
            {tr("pas.show")}
          </button>
          <button type="button" className="btn" onClick={onGezien}>
            {tr("pas.ok")}
          </button>
        </div>
      </section>
    </div>
  );
}
