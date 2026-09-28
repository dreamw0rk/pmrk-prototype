import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { BY_UID, NOW } from '@/shared/mock/data';
import { buildExternal, type Indicator } from '@/shared/mock/external';
import { dateRu, moneyCompact } from '@/shared/format';

/* Расширенный отчет «СПАРК-Профиль» (ФТ-1.18): «бумажная» A4-страница вне
   оболочки приложения, по образцу CounterpartyReport (ФТ-7.1). Скачивание —
   window.print → «Сохранить как PDF». Состав — данные внешних источников
   СПАРК-Интерфакс (тот же buildExternal, что во вкладке «Внешняя информация»),
   поэтому отчет и вкладка не могут разойтись. */

const stamp = (d: Date) => `${dateRu(d.toISOString().slice(0, 10))} ${d.toTimeString().slice(0, 5)}`;
const LEVEL_CLASS: Record<string, string> = { low: 'sprep-v--low', medium: 'sprep-v--mid', high: 'sprep-v--high' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sprep-section">
      <h2 className="sprep-h2">{title}</h2>
      {children}
    </section>
  );
}

function IndicatorRows({ items }: { items: Indicator[] }) {
  return (
    <div className="sprep-grid">
      {items.map((x, i) => (
        <div key={i} className="sprep-cell" title={x.tip}>
          <div className="sprep-k">{x.label}</div>
          <div className={`sprep-v ${x.level ? LEVEL_CLASS[x.level] : ''}`}>
            {x.rows ? x.rows.map((r, k) => <div key={k}>{r.amount} — {r.name}</div>) : x.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SparkProfileReport() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const c = uid ? BY_UID.get(uid) : undefined;

  if (!c) {
    return (
      <div style={{ padding: 48, fontSize: 15 }}>
        Контрагент не найден.{' '}
        <button onClick={() => navigate('/registry')} style={{ color: '#1e4fd6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>В реестр →</button>
      </div>
    );
  }

  const ext = buildExternal(c);

  return (
    <div className="sprep-root">
      <style>{SPARK_REPORT_CSS}</style>

      <div className="sprep-toolbar">
        <Button size="s" view="ghost" label="← Назад" onClick={() => navigate(-1)} />
        <div style={{ flex: 1 }} />
        <Button size="s" view="secondary" label="Печать" onClick={() => window.print()} />
        <Button size="s" label="Скачать PDF" onClick={() => window.print()} />
      </div>

      <div className="sprep-doc">
        <div className="sprep-head">
          <div className="sprep-brand">
            <span className="sprep-logo">S</span>
            <div>
              <b>СПАРК-Профиль</b>
              <div className="sprep-sub">СПАРК-Интерфакс · выгрузка через ПМРК</div>
            </div>
          </div>
          <div className="sprep-docmeta">
            <div className="sprep-doctitle">Расширенный отчет</div>
            <div className="sprep-sub">ФТ-1.18 · формат PDF</div>
          </div>
        </div>

        <h1 className="sprep-name">{c.name}</h1>
        <div className="sprep-stamp">Сформирован {stamp(NOW)} · данные СПАРК-Интерфакс на {dateRu(c.asOf.external ?? c.asOf.general ?? NOW.toISOString().slice(0, 10))}</div>

        <Section title="Реквизиты и регистрационные данные">
          <div className="sprep-grid">
            {([
              ['Полное наименование', c.name],
              ['ИНН / КПП', `${c.inn} / ${c.kpp}`],
              ['ОГРН', c.ogrn],
              ['Статус (СПАРК)', c.status],
              ['Дата регистрации', dateRu(c.registered)],
              ['Регион регистрации', c.region],
              ['Основной ОКВЭД', `${c.okvedCode} — ${c.okved}`],
              ['Выручка (последний год), руб.', moneyCompact(c.revenue)],
            ] as [string, React.ReactNode][]).map(([k, v], i) => (
              <div key={i} className="sprep-cell">
                <div className="sprep-k">{k}</div>
                <div className="sprep-v">{v}</div>
              </div>
            ))}
          </div>
        </Section>

        {ext.sections.map((s) => (
          <Section key={s.key} title={s.title}>
            {s.indicators && <IndicatorRows items={s.indicators} />}
          </Section>
        ))}

        <Section title="Санкционные списки">
          {ext.sanctions.length ? (
            <table className="sprep-table">
              <thead>
                <tr><th>Категория</th><th>Список</th><th>Основание</th><th>С даты</th><th>Тип</th></tr>
              </thead>
              <tbody>
                {ext.sanctions.map((s, i) => (
                  <tr key={i}>
                    <td>{s.category}</td>
                    <td>{s.list}</td>
                    <td>{s.reason}</td>
                    <td>{dateRu(s.from)}</td>
                    <td>{s.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="sprep-empty">В санкционных списках не значится.</div>
          )}
        </Section>

        <Section title="Арбитражные дела (ответчик)">
          {ext.courtCases.length ? (
            <table className="sprep-table">
              <thead>
                <tr><th>Истец</th><th>Номер дела</th><th>Категория</th><th>Состояние</th><th>Дата</th><th>Сумма иска, руб.</th></tr>
              </thead>
              <tbody>
                {ext.courtCases.map((x, i) => (
                  <tr key={i}>
                    <td>{x.plaintiff}</td>
                    <td>{x.number}</td>
                    <td>{x.category}</td>
                    <td>{x.state}</td>
                    <td>{dateRu(x.date)}</td>
                    <td>{moneyCompact(x.claim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="sprep-empty">Арбитражных дел в роли ответчика не выявлено.</div>
          )}
        </Section>

        <div className="sprep-foot">
          <div>Отчет сформирован по данным информационного ресурса СПАРК-Интерфакс (ФТ-1.18). Справочный материал, не является решением (П-2). Для принятия решения используйте актуальные сведения на дату операции.</div>
          <div className="sprep-foot-stamp">Сформировано в ПМРК · {stamp(NOW)} · контрагент ИНН {c.inn}</div>
        </div>
      </div>
    </div>
  );
}

const SPARK_REPORT_CSS = `
.sprep-root { min-height: 100vh; background: #eef1f5; padding: 24px 0 64px; font-family: Inter, system-ui, sans-serif; }
.sprep-toolbar { max-width: 820px; margin: 0 auto 16px; display: flex; align-items: center; gap: 8px; padding: 0 8px; }
.sprep-doc { max-width: 820px; margin: 0 auto; background: #fff; color: #1a2230; padding: 40px 44px; box-shadow: 0 8px 30px rgba(20,30,50,.12); border-radius: 6px; font-size: 13px; line-height: 1.5; }
.sprep-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14684a; padding-bottom: 14px; }
.sprep-brand { display: flex; gap: 10px; align-items: center; }
.sprep-logo { width: 34px; height: 34px; border-radius: 8px; background: #14684a; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; flex: none; }
.sprep-brand b { font-size: 15px; color: #14684a; }
.sprep-sub { color: #6b7689; font-size: 11px; }
.sprep-docmeta { text-align: right; }
.sprep-doctitle { font-size: 15px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #14684a; }
.sprep-name { font-size: 22px; font-weight: 800; margin: 18px 0 4px; color: #15233b; }
.sprep-stamp { color: #6b7689; font-size: 11.5px; margin-bottom: 12px; }
.sprep-section { margin-top: 18px; break-inside: avoid; }
.sprep-h2 { font-size: 14px; font-weight: 800; color: #14684a; border-bottom: 1px solid #e2ece7; padding-bottom: 5px; margin: 0 0 10px; }
.sprep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 28px; }
.sprep-cell { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dotted #e7ebf2; padding: 3px 0; }
.sprep-k { color: #6b7689; flex: none; max-width: 60%; }
.sprep-v { font-weight: 600; text-align: right; }
.sprep-v--low { color: #1d7c46; }
.sprep-v--mid { color: #b9770f; }
.sprep-v--high { color: #c0392b; }
.sprep-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
.sprep-table th { text-align: left; color: #6b7689; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid #d7dde6; padding: 5px 10px 5px 0; }
.sprep-table td { padding: 5px 10px 5px 0; border-bottom: 1px solid #f0f3f7; vertical-align: top; }
.sprep-empty { color: #6b7689; font-style: italic; }
.sprep-foot { margin-top: 26px; border-top: 1px solid #e2ece7; padding-top: 12px; color: #6b7689; font-size: 11px; }
.sprep-foot-stamp { margin-top: 4px; }

@media print {
  @page { size: A4; margin: 14mm 13mm; }
  .sprep-root { background: #fff; padding: 0; }
  .sprep-toolbar { display: none !important; }
  .sprep-doc { max-width: none; width: 100%; box-shadow: none; border-radius: 0; padding: 0; }
  .sprep-section { break-inside: avoid; }
}
`;
