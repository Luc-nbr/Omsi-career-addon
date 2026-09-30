/**
 * DE GRENDEL VAN DE OMSI-MAP (lakstudio-ontwerp §5.6, kritiek punt 17)
 *
 * Eén klus tegelijk die in de OMSI-map schrijft of er iets uit haalt: een
 * add-on installeren of verwijderen, een eigen lak plaatsen of verwijderen, de
 * wachtrij van de Lakstudio afwerken. Stond eerst als `eenTegelijk` binnen de
 * IPC van de add-on-manager (main/index.ts); dan kon een lak die klaarstond
 * geplaatst worden terwijl een add-on half geïnstalleerd was, en zag het plan van
 * de een de bestanden van de ander als "bestaat al".
 *
 * Wie de grendel niet krijgt, hoort `{ fout: 'bezig' }` (ls.bezig); er wordt
 * niet gewacht, want een klus kan minuten duren (een kaart van gigabytes).
 */
export interface Grendel {
  /** Doe de klus als de grendel vrij is; anders `{ fout: 'bezig' }`. */
  probeer<T>(klus: () => Promise<T>, naam?: string): Promise<T | { fout: 'bezig' }>
  bezig(): boolean
  /** Wie hem heeft, voor het logboek. */
  wie(): string | undefined
}

export function maakGrendel(): Grendel {
  let houder: string | undefined
  return {
    async probeer<T>(klus: () => Promise<T>, naam = 'klus'): Promise<T | { fout: 'bezig' }> {
      if (houder !== undefined) return { fout: 'bezig' }
      houder = naam
      try {
        return await klus()
      } finally {
        houder = undefined
      }
    },
    bezig: () => houder !== undefined,
    wie: () => houder
  }
}
