import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { BY_UID, GRAPHS, NOW } from '@/shared/mock/data';
import { buildExternal, type Indicator } from '@/shared/mock/external';
import { dateRu, moneyCompact } from '@/shared/format';
import type { Counterparty } from '@/shared/mock/types';

/* Скачиваемые документы шапки профиля, недостающие после СПАРК-Профиля:
   — «Выписка из ЕГРЮЛ/ЕГРИП» (ФТ-1.16), стилизация под официальную выписку ФНС;
   — «СПАРК-Риски» (ФТ-1.19), риск-срез данных СПАРК-Интерфакс.
   Паттерн общий с CounterpartyReport/SparkProfileReport: «бумажная» A4-страница
   вне оболочки, скачивание через window.print → «Сохранить как PDF». */

const stamp = (d: Date) => `${dateRu(d.toISOString().slice(0, 10))} ${d.toTimeString().slice(0, 5)}`;
const LEVEL_CLASS: Record<string, string> = { low: 'xrep-v--low', medium: 'xrep-v--mid', high: 'xrep-v--high' };

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ padding: 48, fontSize: 15 }}>
      Контрагент не найден.{' '}
      <button onClick={onBack} style={{ color: '#1e4fd6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>В реестр →</button>
    </div>
  );
}

function Toolbar() {
  const navigate = useNavigate();
  return (
    <div className="xrep-toolbar">
      <Button size="s" view="ghost" label="← Назад" onClick={() => navigate(-1)} />
      <div style={{ flex: 1 }} />
      <Button size="s" view="secondary" label="Печать" onClick={() => window.print()} />
      <Button size="s" label="Скачать PDF" onClick={() => window.print()} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="xrep-section">
      <h2 className="xrep-h2">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ pairs }: { pairs: [string, React.ReactNode][] }) {
  return (
    <div className="xrep-grid">
      {pairs.map(([k, v], i) => (
        <div key={i} className="xrep-cell">
          <div className="xrep-k">{k}</div>
          <div className="xrep-v">{v}</div>
        </div>
      ))}
    </div>
  );
}

function IndicatorRows({ items }: { items: Indicator[] }) {
  return (
    <div className="xrep-grid">
      {items.map((x, i) => (
        <div key={i} className="xrep-cell" title={x.tip}>
          <div className="xrep-k">{x.label}</div>
          <div className={`xrep-v ${x.level ? LEVEL_CLASS[x.level] : ''}`}>{x.value}</div>
        </div>
      ))}
    </div>
  );
}

function useCounterparty(): Counterparty | undefined {
  const { uid } = useParams();
  return uid ? BY_UID.get(uid) : undefined;
}

/* ============================== ФТ-1.16 =============================== */

export function EgrulExtract() {
  const navigate = useNavigate();
  const c = useCounterparty();
  if (!c) return <NotFound onBack={() => navigate('/registry')} />;

  // владельцы (участники) для выписки — тип аффилированности 2 «Владельцы (с долей более 20 %)»
  const owners = (GRAPHS[c.uid]?.nodes ?? []).filter((n) => n.kinds.includes(2));

  return (
    <div className="xrep-root" data-accent="fns">
      <style>{EXTRA_REPORT_CSS}</style>
      <Toolbar />
      <div className="xrep-doc">
        <div className="xrep-head">
          <div className="xrep-brand">
            <span className="xrep-logo">ФНС</span>
            <div>
              <b>Выписка из ЕГРЮЛ</b>
              <div className="xrep-sub">Единый государственный реестр юридических лиц</div>
            </div>
          </div>
          <div className="xrep-docmeta">
            <div className="xrep-doctitle">Электронная выписка</div>
            <div className="xrep-sub">ФТ-1.16 · формат PDF · через ПМРК (данные СПАРК/ЕГРЮЛ)</div>
          </div>
        </div>

        <h1 className="xrep-name">{c.name}</h1>
        <div className="xrep-stamp">Сформирована {stamp(NOW)} · сведения по состоянию на {dateRu(c.asOf.general ?? NOW.toISOString().slice(0, 10))}</div>

        <Section title="1. Наименование юридического лица">
          <Rows pairs={[
            ['Полное наименование', c.name],
            ['Сокращённое наименование', c.shortName],
          ]} />
        </Section>

        <Section title="2. Сведения о регистрации">
          <Rows pairs={[
            ['ОГРН', c.ogrn],
            ['Дата присвоения ОГРН', dateRu(c.registered)],
            ['ИНН', c.inn],
            ['КПП', c.kpp],
            ['Статус юридического лица', c.status],
          ]} />
        </Section>

        <Section title="3. Место нахождения">
          <Rows pairs={[['Регион регистрации', c.region]]} />
        </Section>

        <Section title="4. Виды экономической деятельности (ОКВЭД)">
          <table className="xrep-table">
            <thead>
              <tr><th>Код</th><th>Наименование вида деятельности</th><th>Признак</th></tr>
            </thead>
            <tbody>
              <tr><td>{c.okvedCode}</td><td>{c.okved}</td><td>Основной</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="5. Сведения об учредителях (участниках)">
          {owners.length ? (
            <table className="xrep-table">
              <thead>
                <tr><th>Наименование / ФИО</th><th>ИНН</th><th>Доля прямого владения</th><th>Тип лица</th></tr>
              </thead>
              <tbody>
                {owners.map((n) => (
                  <tr key={n.id}>
                    <td>{n.name}</td>
                    <td>{n.inn ?? '—'}</td>
                    <td>{n.directShare != null ? `${n.directShare}%` : '—'}</td>
                    <td>{n.isPerson ? 'Физическое лицо' : 'Юридическое лицо'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="xrep-empty">Сведения об учредителях в ПМРК не загружены.</div>
          )}
        </Section>

        <Section title="6. Дополнительные сведения">
          <Rows pairs={[
            ['Среднесписочная численность', `${c.employees.toLocaleString('ru-RU')} чел.`],
            ['Работает с ДО ГК ГПН', c.subsidiary],
          ]} />
        </Section>

        <div className="xrep-foot">
          <div>Выписка сформирована в электронном виде по данным СПАРК/ЕГРЮЛ, загруженным в ПМРК (ФТ-1.16). Для юридически значимых действий запросите выписку с ЭП ФНС на egrul.nalog.ru.</div>
          <div className="xrep-foot-stamp">Сформировано в ПМРК · {stamp(NOW)} · контрагент ИНН {c.inn}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================== ФТ-1.19 =============================== */

export function SparkRisksReport() {
  const navigate = useNavigate();
  const c = useCounterparty();
  if (!c) return <NotFound onBack={() => navigate('/registry')} />;

  const ext = buildExternal(c);
  const riskKeys = new Set(['s1', 's2', 's6', 's7', 's11']);
  const riskSections = ext.sections.filter((s) => riskKeys.has(s.key));

  return (
    <div className="xrep-root" data-accent="risk">
      <style>{EXTRA_REPORT_CSS}</style>
      <Toolbar />
      <div className="xrep-doc">
        <div className="xrep-head">
          <div className="xrep-brand">
            <span className="xrep-logo">S</span>
            <div>
              <b>СПАРК-Риски</b>
              <div className="xrep-sub">СПАРК-Интерфакс · выгрузка через ПМРК</div>
            </div>
          </div>
          <div className="xrep-docmeta">
            <div className="xrep-doctitle">Отчет о рисках</div>
            <div className="xrep-sub">ФТ-1.19 · формат PDF</div>
          </div>
        </div>

        <h1 className="xrep-name">{c.name}</h1>
        <div className="xrep-stamp">Сформирован {stamp(NOW)} · ИНН {c.inn} · данные СПАРК-Интерфакс на {dateRu(c.asOf.external ?? c.asOf.general ?? NOW.toISOString().slice(0, 10))}</div>

        {riskSections.map((s) => (
          <Section key={s.key} title={s.title}>
            {s.indicators && <IndicatorRows items={s.indicators} />}
          </Section>
        ))}

        <Section title="Санкционные списки">
          {ext.sanctions.length ? (
            <table className="xrep-table">
              <thead>
                <tr><th>Категория</th><th>Список</th><th>Основание</th><th>С даты</th></tr>
              </thead>
              <tbody>
                {ext.sanctions.map((s, i) => (
                  <tr key={i}><td>{s.category}</td><td>{s.list}</td><td>{s.reason}</td><td>{dateRu(s.from)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="xrep-empty">В санкционных списках не значится.</div>
          )}
        </Section>

        <Section title="Арбитражные дела (ответчик)">
          {ext.courtCases.length ? (
            <table className="xrep-table">
              <thead>
                <tr><th>Истец</th><th>Номер дела</th><th>Состояние</th><th>Дата</th><th>Сумма иска, руб.</th></tr>
              </thead>
              <tbody>
                {ext.courtCases.map((x, i) => (
                  <tr key={i}><td>{x.plaintiff}</td><td>{x.number}</td><td>{x.state}</td><td>{dateRu(x.date)}</td><td>{moneyCompact(x.claim)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="xrep-empty">Арбитражных дел в роли ответчика не выявлено.</div>
          )}
        </Section>

        <div className="xrep-foot">
          <div>Отчет сформирован по данным информационного ресурса СПАРК-Интерфакс (ФТ-1.19). Справочный материал, не является решением (П-2). Для принятия решения используйте актуальные сведения на дату операции.</div>
          <div className="xrep-foot-stamp">Сформировано в ПМРК · {stamp(NOW)} · контрагент ИНН {c.inn}</div>
        </div>
      </div>
    </div>
  );
}

/* Общий каркас двух документов; акцент задаётся data-accent на корне:
   fns — сине-стальной (официальная выписка), risk — красный (отчет о рисках). */
const EXTRA_REPORT_CSS = `
.xrep-root { min-height: 100vh; background: #eef1f5; padding: 24px 0 64px; font-family: Inter, system-ui, sans-serif; --xrep-accent: #15233b; }
.xrep-root[data-accent="fns"] { --xrep-accent: #274b8f; }
.xrep-root[data-accent="risk"] { --xrep-accent: #a03123; }
.xrep-toolbar { max-width: 820px; margin: 0 auto 16px; display: flex; align-items: center; gap: 8px; padding: 0 8px; }
.xrep-doc { max-width: 820px; margin: 0 auto; background: #fff; color: #1a2230; padding: 40px 44px; box-shadow: 0 8px 30px rgba(20,30,50,.12); border-radius: 6px; font-size: 13px; line-height: 1.5; }
.xrep-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--xrep-accent); padding-bottom: 14px; }
.xrep-brand { display: flex; gap: 10px; align-items: center; }
.xrep-logo { min-width: 34px; height: 34px; padding: 0 6px; border-radius: 8px; background: var(--xrep-accent); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex: none; }
.xrep-brand b { font-size: 15px; color: var(--xrep-accent); }
.xrep-sub { color: #6b7689; font-size: 11px; }
.xrep-docmeta { text-align: right; }
.xrep-doctitle { font-size: 15px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--xrep-accent); }
.xrep-name { font-size: 22px; font-weight: 800; margin: 18px 0 4px; color: #15233b; }
.xrep-stamp { color: #6b7689; font-size: 11.5px; margin-bottom: 12px; }
.xrep-section { margin-top: 18px; break-inside: avoid; }
.xrep-h2 { font-size: 14px; font-weight: 800; color: var(--xrep-accent); border-bottom: 1px solid #e7ebf2; padding-bottom: 5px; margin: 0 0 10px; }
.xrep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 28px; }
.xrep-cell { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dotted #e7ebf2; padding: 3px 0; }
.xrep-k { color: #6b7689; flex: none; max-width: 60%; }
.xrep-v { font-weight: 600; text-align: right; }
.xrep-v--low { color: #1d7c46; }
.xrep-v--mid { color: #b9770f; }
.xrep-v--high { color: #c0392b; }
.xrep-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
.xrep-table th { text-align: left; color: #6b7689; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid #d7dde6; padding: 5px 10px 5px 0; }
.xrep-table td { padding: 5px 10px 5px 0; border-bottom: 1px solid #f0f3f7; vertical-align: top; }
.xrep-empty { color: #6b7689; font-style: italic; }
.xrep-foot { margin-top: 26px; border-top: 1px solid #e7ebf2; padding-top: 12px; color: #6b7689; font-size: 11px; }
.xrep-foot-stamp { margin-top: 4px; }

@media print {
  @page { size: A4; margin: 14mm 13mm; }
  .xrep-root { background: #fff; padding: 0; }
  .xrep-toolbar { display: none !important; }
  .xrep-doc { max-width: none; width: 100%; box-shadow: none; border-radius: 0; padding: 0; }
  .xrep-section { break-inside: avoid; }
}
`;
