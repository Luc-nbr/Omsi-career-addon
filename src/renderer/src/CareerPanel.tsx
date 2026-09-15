import { useState, type JSX } from 'react'
import type { CareerState, Licence } from '../../core/career'
import type { LineSummary } from '../../core/duty'
import { EXAM_LIMITS, type ExamRule } from '../../core/exam'
import type { MapSummary } from '../../shared/api'
import { t, type Language } from '../../shared/i18n'
import { LinePicker } from './LinePicker'

interface Props {
  language: Language
  state: CareerState
  maps: MapSummary[]
  lines: LineSummary[]
  mapFolder: string
  onMapChange(folder: string): void
  busy: boolean
  /** Laat de remise een dienst uitzoeken op een lijn waar een vergunning voor is. */
  onAssign(lineFile: string): void
  /** Examen doen op deze lijn; `basic` is het rijexamen zelf. */
  onExam(line: LineSummary, basic: boolean): void
}

/** De eisen, in dezelfde volgorde als het oordeel ze teruggeeft. */
const RULES: Array<{ rule: ExamRule; key: 'exam.rule.finish' | 'exam.rule.punctual' | 'exam.rule.smooth' | 'exam.rule.speed'; limit: number }> = [
  { rule: 'finish', key: 'exam.rule.finish', limit: 0 },
  { rule: 'punctual', key: 'exam.rule.punctual', limit: EXAM_LIMITS.delayMinutes },
  { rule: 'smooth', key: 'exam.rule.smooth', limit: EXAM_LIMITS.harsh },
  { rule: 'speed', key: 'exam.rule.speed', limit: EXAM_LIMITS.topSpeed }
]

/**
 * De carrièremodus.
 *
 * Zonder rijexamen valt er niets te rijden: eerst kiest de chauffeur de route
 * waarop hij afgereden wil worden. Daarna wijst de remise zijn diensten toe, en
 * alleen op lijnen waarvoor hij een vergunning heeft. Een lijn erbij betekent
 * een examen erbij.
 */
export function CareerPanel({
  language,
  state,
  maps,
  lines,
  mapFolder,
  onMapChange,
  busy,
  onAssign,
  onExam
}: Props): JSX.Element {
  const [examLine, setExamLine] = useState('')
  const [learning, setLearning] = useState(false)

  const licences = state.licences
  const qualified = licences.length > 0
  const here = licences.filter((licence) => licence.mapFolder === mapFolder)
  // Alleen lijnen zonder vergunning zijn nog te leren.
  const open = lines.filter(
    (line) => !licences.some((l) => l.mapFolder === mapFolder && l.lineFile === line.lineFile)
  )
  const examining = !qualified || learning
  const chosen = open.find((line) => line.lineFile === examLine) ?? open[0]

  return (
    <section className="card">
      <h2 className="section-title">
        {examining ? t(language, qualified ? 'exam.lineTitle' : 'exam.title') : t(language, 'lic.title')}
      </h2>

      {examining ? (
        <>
          <p className="note">{t(language, qualified ? 'exam.lineIntro' : 'exam.intro')}</p>

          <div className="field-grid">
            <div>
              <label htmlFor="map">{t(language, 'app.map')}</label>
              <select
                id="map"
                value={mapFolder}
                disabled={busy}
                onChange={(event) => onMapChange(event.target.value)}
              >
                {maps.map((item) => (
                  <option key={item.folder} value={item.folder}>
                    {item.name} — {t(language, 'app.mapTours', { count: item.tours })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <LinePicker
                language={language}
                lines={open}
                value={chosen?.lineFile ?? ''}
                disabled={busy}
                allowAny={false}
                label={t(language, 'exam.route')}
                onChange={setExamLine}
              />
            </div>
          </div>

          <h3 className="section-title" style={{ marginTop: 18 }}>
            {t(language, 'exam.rules')}
          </h3>
          <ul className="rules">
            {RULES.map((item) => (
              <li key={item.rule}>{t(language, item.key, { limit: item.limit })}</li>
            ))}
          </ul>

          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={busy || !chosen}
              onClick={() => chosen && onExam(chosen, !qualified)}
            >
              {t(language, 'exam.start')}
            </button>
            {qualified && (
              <button type="button" className="btn secondary" onClick={() => setLearning(false)}>
                {t(language, 'pick.cancel')}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="note">{t(language, 'lic.onlyThese')}</p>
          <div className="licences">
            {licences.map((licence) => (
              <LicenceCard key={`${licence.mapFolder}|${licence.lineFile}`} licence={licence} language={language} />
            ))}
          </div>

          <div className="field-grid" style={{ marginTop: 16 }}>
            <div>
              <label htmlFor="map">{t(language, 'app.map')}</label>
              <select
                id="map"
                value={mapFolder}
                disabled={busy}
                onChange={(event) => onMapChange(event.target.value)}
              >
                {maps.map((item) => (
                  <option key={item.folder} value={item.folder}>
                    {item.name} — {t(language, 'app.mapTours', { count: item.tours })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="actions">
            {/*
              De remise kiest zelf welke lijn het wordt; de chauffeur vraagt
              alleen om werk. Staat er op deze kaart geen vergunning, dan valt er
              hier niets toe te wijzen.
            */}
            <button
              type="button"
              className="btn"
              disabled={busy || here.length === 0}
              onClick={() => onAssign(here[Math.floor(Math.random() * here.length)].lineFile)}
            >
              {t(language, 'lic.assign')}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy || open.length === 0}
              onClick={() => setLearning(true)}
            >
              {t(language, 'lic.another')}
            </button>
            {here.length === 0 && <span className="note">{t(language, 'lic.none')}</span>}
          </div>
        </>
      )}
    </section>
  )
}

function LicenceCard({ licence, language }: { licence: Licence; language: Language }): JSX.Element {
  return (
    <div className="licence">
      <b>{licence.lineNumbers.join('/') || licence.lineFile}</b>
      <span>{licence.mapName || licence.mapFolder}</span>
      <span className="licence-date">
        {t(language, 'lic.earned', { date: licence.earnedAt.slice(0, 10) })}
        {licence.basic ? ` · ${t(language, 'exam.title')}` : ''}
      </span>
    </div>
  )
}
