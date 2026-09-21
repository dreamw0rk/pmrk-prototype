import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { useApp } from '@/app/AppContext';
import { BY_UID, GRAPHS, groupLabel, NOW } from '@/shared/mock/data';
import { ROLES } from '@/shared/roles';
import { moneyCompact, dateRu } from '@/shared/format';
import type { AffiliationLinkType } from '@/shared/mock/types';

/* Скачиваемый профиль контрагента (ФТ-7.1, РФ). Отдельная «бумажная» A4-страница
   вне оболочки приложения: открывается из карточки и печатается в PDF
   (window.print → «Сохранить как PDF»). Состав — по карточке контрагента. */

const LINK_LABEL: Record<AffiliationLinkType, string> = {
  owner: 'Владелец',
  beneficiary: 'Бенефициар',
  subsidiary: 'Дочернее / зависимое',
  affiliate: 'Аффилированное',
};
const COURT_KIND: Record<string, string> = {
  claim: 'Претензия',
  lawsuit: 'Судебный иск',
  enforcement: 'Исп. производство',
  bankruptcy: 'Банкротство',
};
const SENT: Record<string, string> = { negative: 'негатив', neutral: 'нейтрально', positive: 'позитив' };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const stamp = (d: Date) => `${dateRu(d.toISOString().slice(0, 10))} ${d.toTimeString().slice(0, 5)}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rep-section">
      <h2 className="rep-h2">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ pairs }: { pairs: [string, React.ReactNode][] }) {
  return (
    <div className="rep-grid">
      {pairs.map(([k, v], i) => (
        <div key={i} className="rep-cell">
          <div className="rep-k">{k}</div>
          <div className="rep-v">{v}</div>
        </div>
      ))}
    </div>
  );
}

export function CounterpartyReport() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { role } = useApp();
  const c = uid ? BY_UID.get(uid) : undefined;

  if (!c) {
    return (
      <div style={{ padding: 48, fontSize: 15 }}>
        Контрагент не найден.{' '}
        <button onClick={() => navigate('/registry')} style={{ color: '#1e4fd6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>В реестр →</button>
      </div>
    );
  }

  const graph = GRAPHS[c.uid];
  const lastDebt = c.debt.length ? c.debt[c.debt.length - 1] : undefined;
  const lastAsmt = c.assessments[0];
  const formedBy = ROLES[role].title;

  return (
    <div className="rep-root">
      <style>{REPORT_CSS}</style>

      <div className="rep-toolbar">
        <Button size="s" view="ghost" label="← Назад" onClick={() => navigate(-1)} />
        <div style={{ flex: 1 }} />
        <Button size="s" view="secondary" label="Печать" onClick={() => window.print()} />
        <Button size="s" label="Скачать PDF" onClick={() => window.print()} />
      </div>

      <div className="rep-doc">
        {/* Шапка */}
        <div className="rep-head">
          <div className="rep-brand">
            <span className="rep-logo">ПМ</span>
            <div>
              <b>ПМРК</b>
              <div className="rep-sub">Кредитный контроль · ГК «Газпром нефть»</div>
            </div>
          </div>
          <div className="rep-docmeta">
            <div className="rep-doctitle">Профиль контрагента</div>
            <div className="rep-sub">Форма ФТ-7.1 · Российская Федерация</div>
          </div>
        </div>

        <h1 className="rep-name">{c.name}</h1>
        <div className="rep-stamp">Сформирован {stamp(NOW)} · {formedBy} · Источники: СПАРК, ЕГРЮЛ, PRIMO, АГАТА</div>

        <div className="rep-flags">
          <span className="rep-flag">{groupLabel(c.group)} · балл {c.score}</span>
          {c.underSanctions && <span className="rep-flag rep-flag--bad">Под санкциями</span>}
          {c.specialControl && <span className="rep-flag rep-flag--warn">Особый контроль</span>}
          <span className="rep-flag">{c.status}</span>
        </div>

        <Section title="1. Реквизиты">
          <Grid
            pairs={[
              ['Полное наименование', c.name],
              ['ИНН / КПП', `${c.inn} / ${c.kpp}`],
              ['ОГРН', c.ogrn],
              ['Статус (СПАРК)', c.status],
              ['Основной ОКВЭД', `${c.okvedCode} — ${c.okved}`],
              ['Регион регистрации', c.region],
              ['Дата регистрации', dateRu(c.registered)],
              ['Выручка (последний год), ₽', moneyCompact(c.revenue)],
              ['Численность', `${c.employees.toLocaleString('ru-RU')} чел.`],
              ['Работает с ДО', c.subsidiary],
            ]}
          />
        </Section>

        <Section title="2. Оценка кредитоспособности">
          <Grid
            pairs={[
              ['Группа риска', groupLabel(c.group)],
              ['Интегральный балл', `${c.score} из 100`],
              ['Индекс РБ', `${c.rbIndex} / 14`],
              ['Последняя оценка', lastAsmt ? `${dateRu(lastAsmt.date)} · ${lastAsmt.author} · ${lastAsmt.directionLabel}` : '—'],
            ]}
          />
          {c.pdForecast.length > 0 && (
            <table className="rep-table">
              <thead>
                <tr>
                  <th>Горизонт</th>
                  <th>Вероятность дефолта (PD), модель АГАТА</th>
                </tr>
              </thead>
              <tbody>
                {c.pdForecast.map((p) => (
                  <tr key={p.horizon}>
                    <td>{p.horizon}</td>
                    <td>{p.pd}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="3. Кредитный лимит">
          <Grid
            pairs={[
              ['Действующий КЛ, ₽', c.creditLimit ? moneyCompact(c.creditLimit) : 'не установлен'],
              ['Использование лимита', c.creditLimit ? pct(c.limitUtilization) : '—'],
              ['Совокупный лимит группы, ₽', c.groupAggregateLimit ? moneyCompact(c.groupAggregateLimit) : '—'],
            ]}
          />
        </Section>

        <Section title="4. Дебиторская и кредиторская задолженность">
          {lastDebt ? (
            <Grid
              pairs={[
                ['Дебиторская задолженность (ДЗ), ₽', moneyCompact(lastDebt.dz)],
                ['Просроченная ДЗ (ПДЗ), ₽', `${moneyCompact(lastDebt.pdz)} · ${pct(lastDebt.pdz / Math.max(1, lastDebt.dz))}`],
                ['Выданные авансы, ₽', moneyCompact(lastDebt.advance)],
                ['Кредиторская задолженность (КЗ), ₽', moneyCompact(lastDebt.payable)],
                ['Актуальность раздела', c.asOf.debt ? dateRu(c.asOf.debt) : '—'],
              ]}
            />
          ) : (
            <div className="rep-empty">Данные по задолженности отсутствуют.</div>
          )}
        </Section>

        <Section title="5. Санкции и особый контроль">
          {c.sanctions.length ? (
            <table className="rep-table">
              <thead>
                <tr>
                  <th>Программа</th>
                  <th>Орган</th>
                  <th>Дата</th>
                  <th>Основание</th>
                </tr>
              </thead>
              <tbody>
                {c.sanctions.map((s, i) => (
                  <tr key={i}>
                    <td>{s.program}</td>
                    <td>{s.authority}</td>
                    <td>{dateRu(s.date)}</td>
                    <td>{s.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="rep-empty">Санкционных ограничений не выявлено.</div>
          )}
          <div className="rep-note">Особый контроль: {c.specialControl ? 'установлен' : 'не установлен'}.</div>
        </Section>

        <Section title="6. Аффилированность и структура владения">
          {graph ? (
            <table className="rep-table">
              <thead>
                <tr>
                  <th>Связанное лицо</th>
                  <th>ИНН</th>
                  <th>Тип связи</th>
                  <th>Доля</th>
                </tr>
              </thead>
              <tbody>
                {graph.nodes.map((n) => (
                  <tr key={n.id}>
                    <td>{n.name}{n.underSanctions ? ' (санкции)' : ''}</td>
                    <td>{n.inn ?? '—'}</td>
                    <td>{LINK_LABEL[n.linkType]}</td>
                    <td>{n.directShare != null ? `${n.directShare}% (прямое)` : n.indirectShare != null ? `${n.indirectShare}% (косв.)` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="rep-empty">Сведения о связанных лицах в ПМРК отсутствуют.</div>
          )}
        </Section>

        <Section title="7. Претензионно-исковая работа">
          {c.courtCases.length ? (
            <table className="rep-table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Роль</th>
                  <th>Сумма, ₽</th>
                  <th>Дата</th>
                  <th>Статус</th>
                  <th>Предмет</th>
                </tr>
              </thead>
              <tbody>
                {c.courtCases.map((x) => (
                  <tr key={x.id}>
                    <td>{COURT_KIND[x.kind] ?? x.kind}</td>
                    <td>{x.role}</td>
                    <td>{moneyCompact(x.amount)}</td>
                    <td>{dateRu(x.date)}</td>
                    <td>{x.status}</td>
                    <td>{x.subject}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="rep-empty">Судебных дел не выявлено.</div>
          )}
        </Section>

        <Section title="8. Новости и негативная информация">
          {c.news.length ? (
            <div className="rep-news">
              {c.news.map((n) => (
                <div key={n.id} className="rep-newsrow">
                  <div className="rep-newsdate">{dateRu(n.date)}</div>
                  <div>
                    <b>{n.title}</b>
                    <div className="rep-sub">{n.summary}</div>
                    <div className="rep-src">{n.source} · {SENT[n.sentiment]}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rep-empty">Значимой негативной информации не зафиксировано.</div>
          )}
        </Section>

        <div className="rep-foot">
          <div>Справочный материал, не является решением (П-2). Источники цитируются (П-3). Профиль сформирован автоматически из данных ПМРК; для принятия решения используйте актуальные сведения на дату операции.</div>
          <div className="rep-foot-stamp">Сформировано в ПМРК · {stamp(NOW)} · {formedBy} · контрагент ИНН {c.inn}</div>
        </div>
      </div>
    </div>
  );
}

const REPORT_CSS = `
.rep-root { min-height: 100vh; background: #eef1f5; padding: 24px 0 64px; font-family: Inter, system-ui, sans-serif; }
.rep-toolbar { max-width: 820px; margin: 0 auto 16px; display: flex; align-items: center; gap: 8px; padding: 0 8px; }
.rep-doc { max-width: 820px; margin: 0 auto; background: #fff; color: #1a2230; padding: 40px 44px; box-shadow: 0 8px 30px rgba(20,30,50,.12); border-radius: 6px; font-size: 13px; line-height: 1.5; }
.rep-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #15233b; padding-bottom: 14px; }
.rep-brand { display: flex; gap: 10px; align-items: center; }
.rep-logo { width: 34px; height: 34px; border-radius: 8px; background: #15233b; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex: none; }
.rep-brand b { font-size: 15px; color: #15233b; }
.rep-sub { color: #6b7689; font-size: 11px; }
.rep-docmeta { text-align: right; }
.rep-doctitle { font-size: 15px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #15233b; }
.rep-name { font-size: 22px; font-weight: 800; margin: 18px 0 4px; color: #15233b; }
.rep-stamp { color: #6b7689; font-size: 11.5px; margin-bottom: 12px; }
.rep-flags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.rep-flag { font-size: 12px; font-weight: 700; padding: 4px 11px; border-radius: 999px; background: #eef1f6; color: #15233b; }
.rep-flag--bad { background: #fdeaea; color: #c0392b; }
.rep-flag--warn { background: #fdf3e3; color: #b9770f; }
.rep-section { margin-top: 18px; break-inside: avoid; }
.rep-h2 { font-size: 14px; font-weight: 800; color: #15233b; border-bottom: 1px solid #e7ebf2; padding-bottom: 5px; margin: 0 0 10px; }
.rep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 28px; }
.rep-cell { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dotted #e7ebf2; padding: 3px 0; }
.rep-k { color: #6b7689; flex: none; }
.rep-v { font-weight: 600; text-align: right; }
.rep-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
.rep-table th { text-align: left; color: #6b7689; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid #d7dde6; padding: 5px 10px 5px 0; }
.rep-table td { padding: 5px 10px 5px 0; border-bottom: 1px solid #f0f3f7; vertical-align: top; }
.rep-empty { color: #6b7689; font-style: italic; }
.rep-note { margin-top: 6px; font-size: 12px; color: #6b7689; }
.rep-news { display: flex; flex-direction: column; gap: 9px; }
.rep-newsrow { display: flex; gap: 12px; }
.rep-newsdate { color: #6b7689; font-size: 11.5px; white-space: nowrap; width: 80px; flex: none; }
.rep-src { color: #9aa6b2; font-size: 11px; margin-top: 1px; }
.rep-foot { margin-top: 26px; border-top: 1px solid #e7ebf2; padding-top: 12px; color: #6b7689; font-size: 11px; }
.rep-foot-stamp { margin-top: 4px; }

@media print {
  @page { size: A4; margin: 14mm 13mm; }
  .rep-root { background: #fff; padding: 0; }
  .rep-toolbar { display: none !important; }
  .rep-doc { max-width: none; width: 100%; box-shadow: none; border-radius: 0; padding: 0; }
  .rep-section { break-inside: avoid; }
}
`;
