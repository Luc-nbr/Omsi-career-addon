/**
 * De regels van de automatische updater (core/bijwerken.ts), zonder Electron.
 *
 *   npx tsx scripts/probe-bijwerken.ts
 *
 * - installeren mag alleen zonder dienst, vrije rit, draaiend spel en zonder
 *   dat de speler in de app bezig is;
 * - alleen de geinstalleerde exe werkt zichzelf bij; de draagbare meldt het,
 *   ontwikkeling, een eigen gebruikersmap en alleen-bekijken doen niets;
 * - versies als getallen: 0.10.0 komt na 0.9.9.
 */
import { isNieuwer, magNuInstalleren, welkeUitvoering } from '../src/core/bijwerken'

let fouten = 0
function zeker(waar: boolean, wat: string): void {
  console.log(`${waar ? 'goed' : 'FOUT'}  ${wat}`)
  if (!waar) fouten++
}

const rustig = { dienstLoopt: false, vrijeRit: false, spelDraait: false, spelerInDeApp: false }
zeker(magNuInstalleren(rustig), 'niets aan de hand: installeren')
zeker(!magNuInstalleren({ ...rustig, dienstLoopt: true }), 'dienst loopt: niet')
zeker(!magNuInstalleren({ ...rustig, vrijeRit: true }), 'vrije rit: niet')
zeker(!magNuInstalleren({ ...rustig, spelDraait: true }), 'OMSI of openOMSI draait: niet')
zeker(!magNuInstalleren({ ...rustig, spelerInDeApp: true }), 'speler bezig in de app: niet')

const basis = { verpakt: true, argv: ['OMSI Enhancer.exe'], bekijken: false }
zeker(welkeUitvoering(basis) === 'installatie', 'geinstalleerde exe')
zeker(welkeUitvoering({ ...basis, draagbaarMap: 'C:\Spel' }) === 'draagbaar', 'draagbare exe')
zeker(welkeUitvoering({ ...basis, verpakt: false }) === 'ontwikkeling', 'ontwikkeling')
zeker(welkeUitvoering({ ...basis, argv: ['x.exe', '--user-data-dir=C:\proef'] }) === 'eigenmap', 'eigen gebruikersmap')
zeker(welkeUitvoering({ ...basis, bekijken: true }) === 'bekijken', 'alleen bekijken')

zeker(isNieuwer('0.10.0', '0.9.9'), '0.10.0 na 0.9.9')
zeker(isNieuwer('v0.7.1', '0.7.0'), 'v0.7.1 na 0.7.0')
zeker(!isNieuwer('0.7.0', '0.7.0'), '0.7.0 niet na 0.7.0')
zeker(!isNieuwer('0.6.9', '0.7.0'), '0.6.9 niet na 0.7.0')

console.log(fouten ? `${fouten} fout(en)` : 'alles goed')
process.exit(fouten ? 1 : 0)
