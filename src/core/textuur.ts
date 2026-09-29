import { readFileSync } from 'node:fs'
import { ontleedTextuur, type Textuur, type TextuurLezing } from '../shared/beeldlezers'

export * from '../shared/beeldlezers'

/**
 * De texturen van OMSI, uitgepakt tot kale RGBA-pixels.
 *
 * WAAROM DIT BESTAAT
 * `busmodel.ts` weet welk plaatje er op welk stuk bus hoort, maar niet wat
 * erin staat. Chromium laadt `.png`, `.jpg` en `.bmp` zelf in; de twee
 * formaten die OMSI het meest gebruikt kan hij niet. Geteld over alle 342
 * bestuurbare bussen (`scripts/probe-busmodel.ts`): 79.520 verwijzingen naar
 * `.dds`, 48.272 naar `.tga`, 9.222 `.bmp`, 2.621 `.png` en 531 `.jpg`. Zonder
 * die eerste twee blijft een bus in de keuze dus grijs.
 *
 * DE EXTENSIE ZEGT NIET WAT HET IS
 * Dit bestand kijkt naar de eerste bytes en niet naar de naam, en dat is geen
 * netheid maar noodzaak. Van de 6115 `.dds` onder `Vehicles` zijn er 724 in het
 * geheel geen DDS: 722 zijn een BMP met een andere naam, één is een
 * Paint.NET-bestand (`PDN3`) en één is nul bytes lang. Andersom net zo: 26 van
 * de 5184 `.tga` in deze installatie zijn een DDS, één is een BMP en één een
 * JPEG. Wie op de extensie afgaat, stuurt een BMP door de DXT-uitpakker.
 *
 * WAT ER OP SCHIJF STAAT, GETELD
 * DDS, over de hele installatie (33.707 bestanden): DXT1 14.813, A8 6506,
 * DXT3 6300, DXT5 5145, 32 bits 121, 24 bits 50, 16 bits 1. Onder `Vehicles`
 * alleen: DXT1 2445, DXT3 1624, DXT5 1166, 32 bits 91, 24 bits 50, A8 14,
 * 16 bits 1. Er komt geen DXT2, geen DXT4, geen `DX10`-kop, geen cubemap en
 * geen volumetextuur voor -- niet bij de bussen en niet in de kaarten.
 *
 * TGA, over de hele installatie (5184 bestanden): RLE 32 bits 2355,
 * ongecomprimeerd 32 bits 2056, RLE 24 bits 392, ongecomprimeerd 24 bits 316,
 * RLE met kleurkaart 16, RLE 16 bits 13, grijswaarden 2, kleurkaart 1. Die
 * laatste vier soorten staan niet in `Vehicles`, maar ze kosten samen dertig
 * regels en anders is "wij kunnen TGA" een halve waarheid.
 *
 * DE MAAT
 * De grootste texturen onder `Vehicles` zijn 8192 x 4096 (DDS, `HOH_MAN-A20`)
 * en 4096 x 4096 (TGA, `HC_Volvo7900H`); dat laatste is 64 MB aan RGBA uit één
 * bestand. Van de texturen waar een bestuurbare bus werkelijk naar wijst is de
 * grootste 8192 x 2048 (`MAN_SL_SG\Texture\MAN_SL_ext.dds`), ook 64 MB. 359
 * DDS'en hebben een zijde die geen macht van twee is en bij 46 is een zijde
 * niet deelbaar door vier -- daar loopt het blokrooster van DXT dus over de
 * rand heen en blijft de laatste rij of kolom blokken half onbenut.
 *
 * ALLEEN HET GROOTSTE MIPNIVEAU
 * 1782 DDS'en onder `Vehicles` dragen een mipketen van drie tot dertien
 * niveaus; 3605 hebben alleen het grootste vlak (teller 0 of 1). Die keten
 * hebben wij niet nodig en wordt niet gelezen -- het grootste vlak staat
 * vooraan, dus overslaan kost niets.
 *
 * HOE WE WETEN DAT HET KLOPT
 * Windows heeft sinds Windows 10 zijn eigen DDS-uitpakker in WIC, en die is
 * volstrekt onafhankelijk van deze code. Over 1024 afgetaste pixels per bestand
 * komen wij op: DXT1 (`MAN_NewLionsCity\Texture\18C_main.dds`) 1020 precies
 * gelijk en 4 die één stap van 255 afwijken, DXT3 (`HOH_MAN-A20\Texture\
 * A20_ext.dds`) 1008 gelijk en 16 met één stap verschil, DXT5 (`Citybus 628c
 * ...\Texture\tex3.dds`) 794 gelijk en 230 met één stap. Nooit meer dan één
 * stap, en het **alfakanaal komt bij alle drie op elke afgetaste pixel exact
 * uit** -- de rest is afrondverschil in de twee tussenkleuren. WIC weigert de
 * ongecomprimeerde D3D9-vormen ("the image header might be corrupted"), dus die
 * zijn met het oog nagekeken: zie `scripts/probe-textuur.ts`, dat er plaatjes
 * van schrijft.
 *
 * WAT ER NOOIT GEBEURT
 * Dit bestand gooit niet, net als `o3d.ts` en om dezelfde reden: het draait
 * straks in de werker, en één addon met een verminkte textuur mag niet de hele
 * buslijst omvertrekken. Alles wat niet lukt komt terug als `undefined`, met de
 * reden ernaast voor wie ernaar vraagt.
 *
 * Er zit geen Electron in dit bestand, alleen `node:fs`, zodat het ook in een
 * worker_thread laadt.
 *
 * WAAR DE LEZERS STAAN
 * Sinds 29-09-2026 in shared/beeldlezers.ts, zonder `Buffer`, zodat ook de
 * renderer-werker van het 3D-venster ze gebruikt (bus3d-ontwerp §5.7). Hier
 * staat alleen nog wat de schijf nodig heeft; alles uit beeldlezers.ts wordt
 * doorgegeven, zodat wie hier importeert niets merkt.
 */

/**
 * Leest een textuur van schijf. Geeft `undefined` bij alles wat niet lukt --
 * ook bij een BMP, PNG of JPEG, want die laat de app door Chromium inladen.
 *
 * Dit is de vorm voor wie gewoon pixels wil. Wie wil weten *waarom* het niet
 * lukte -- de probe, en straks het logboek -- neemt `leesTextuurLezing`.
 */
export function leesTextuur(pad: string): Textuur | undefined {
  return leesTextuurLezing(pad).textuur
}

/** Hetzelfde, maar met het soort en de reden erbij. */
export function leesTextuurLezing(pad: string): TextuurLezing {
  let bytes: Buffer
  try {
    bytes = readFileSync(pad)
  } catch (fout) {
    return { klacht: 'onleesbaar', detail: (fout as Error).message }
  }
  return ontleedTextuur(bytes)
}
