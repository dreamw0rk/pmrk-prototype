import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { Modal } from '@consta/uikit/Modal';
import { IconAdd } from '@consta/icons/IconAdd';
import { IconForward } from '@consta/icons/IconForward';
import { PageHeader, SectionCard, StatusBadge, KeyValue, FileDrop } from '@/shared/ui/kit';
import { dateRu, moneyCompact, moneyCompactText } from '@/shared/format';

/* Протоколы КО (ФТ-6.9/6.10). Мастер-детейл: реестр слева → выбранный протокол
   справа (параметры + принятые решения по КЛ). Связь «заявка → протокол → лимит»
   КОНТЕКСТНА: строится по выбранному решению, а не висит примером сверху. */

type DecisionStatus = 'Утверждено' | 'Согласовано' | 'Отклонено' | 'На рассмотрении';

interface Decision {
  ref: string;
  lrId?: string; // ссылка на карточку заявки, если есть
  counterparty: string;
  action: string;
  limit: number;
  level: string;
  status: DecisionStatus;
}

interface Protocol {
  id: string;
  number: string;
  date: string;
  body: string; // коллегиальный орган
  subsidiary?: string; // ДО — только для «Кредитный комитет ДО»
  status: 'Утверждено' | 'Согласовано' | 'Подготовлено КК';
  attachments: string[];
  decisions: Decision[];
}

const PROTOCOLS: Protocol[] = [
  {
    id: 'p18', number: '№ 18', date: '2026-05-16', body: 'Кредитный комитет ДО', subsidiary: 'ООО «Газпромнефть-Логистика»',
    status: 'Утверждено', attachments: ['Протокол_КК-ДО_18.pdf', 'Приложение_1.xlsx'],
    decisions: [
      { ref: 'КЛ-2026-0470', lrId: 'lr-470', counterparty: 'АО «Сибур-Логистика»', action: 'Подтверждение КЛ', limit: 600_000_000, level: 'Кредитный контролёр ДО', status: 'Утверждено' },
      { ref: 'КЛ-2026-0468', counterparty: 'ООО «Торговый дом Прогресс»', action: 'Увеличение КЛ', limit: 90_000_000, level: 'Кредитный контролёр ДО', status: 'Утверждено' },
      { ref: 'КЛ-2026-0466', counterparty: 'ООО «ЮгТрансОйл»', action: 'Снижение КЛ', limit: 50_000_000, level: 'Кредитный контролёр ДО', status: 'Согласовано' },
      { ref: 'КЛ-2026-0463', counterparty: 'ООО «Невские Нефтепродукты»', action: 'Открытие КЛ', limit: 0, level: 'Кредитный контролёр ДО', status: 'Отклонено' },
    ],
  },
  {
    id: 'p17', number: '№ 17', date: '2026-05-02', body: 'Кредитный комитет Блока',
    status: 'Утверждено', attachments: ['Протокол_КК-Блок_17.pdf'],
    decisions: [
      { ref: 'КЛ-2026-0455', counterparty: 'ПАО «РН-Снабжение»', action: 'Увеличение КЛ', limit: 450_000_000, level: 'Кредитный контролёр Блока', status: 'Утверждено' },
      { ref: 'КЛ-2026-0452', counterparty: 'ООО «Балтийская Топливная Компания»', action: 'Подтверждение КЛ', limit: 120_000_000, level: 'Кредитный контролёр Блока', status: 'Утверждено' },
      { ref: 'КЛ-2026-0448', counterparty: 'ООО «СеверСнаб-4821»', action: 'Открытие КЛ', limit: 80_000_000, level: 'Кредитный контролёр Блока', status: 'Согласовано' },
    ],
  },
  {
    id: 'p19', number: '№ 19', date: '2026-06-13', body: 'Кредитный комитет ДО', subsidiary: 'ООО «Газпромнефть — смазочные материалы»',
    status: 'Подготовлено КК', attachments: [],
    decisions: [
      { ref: 'КЛ-2026-0481', lrId: 'lr-481', counterparty: 'ООО «Торговый дом Прогресс»', action: 'Увеличение КЛ', limit: 90_000_000, level: 'Кредитный контролёр Департамента', status: 'На рассмотрении' },
      { ref: 'КЛ-2026-0477', lrId: 'lr-477', counterparty: 'ООО «Балтийская Топливная Компания»', action: 'Снижение КЛ', limit: 100_000_000, level: 'Кредитный контролёр Блока', status: 'На рассмотрении' },
    ],
  },
];

const DECISION_COLOR: Record<DecisionStatus, string> = {
  'Утверждено': 'var(--pmrk-risk-1)',
  'Согласовано': 'var(--color-bg-brand)',
  'Отклонено': 'var(--pmrk-risk-4)',
  'На рассмотрении': 'var(--pmrk-risk-3)',
};

function DecisionBadge({ status }: { status: DecisionStatus }) {
  const c = DECISION_COLOR[status];
  return (
    <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-primary)' }}>
      <span className="pmrk-dot" style={{ background: c }} />
      {status}
    </span>
  );
}

export function Protocols() {
  const navigate = useNavigate();
  const [selProto, setSelProto] = useState(PROTOCOLS[0].id);
  const [selDec, setSelDec] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const proto = PROTOCOLS.find((p) => p.id === selProto)!;
  const dec = proto.decisions[selDec];

  return (
    <div className="pmrk-page">
      <PageHeader
        title="Протоколы КО"
        subtitle="Реестр протоколов коллегиальных органов · решения по кредитным лимитам · видимость КК и АДМ"
        breadcrumbs={[{ label: 'Главная', to: '/' }, { label: 'Протоколы КО' }]}
        actions={<Button size="s" label="Новый протокол" iconLeft={IconAdd as never} onClick={() => setCreateOpen(true)} />}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
        {/* МАСТЕР — реестр протоколов */}
        <div className="pmrk-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-border)', fontWeight: 600 }}>Реестр протоколов</div>
          {PROTOCOLS.map((p, idx) => {
            const active = p.id === selProto;
            return (
              <div
                key={p.id}
                className="pmrk-clickable"
                onClick={() => { setSelProto(p.id); setSelDec(0); setAddOpen(false); }}
                style={{ padding: '12px 16px 12px 13px', borderLeft: active ? '3px solid var(--color-bg-brand)' : '3px solid transparent', background: active ? 'var(--color-bg-secondary)' : undefined, borderTop: idx > 0 ? '1px solid var(--color-bg-border)' : undefined }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700 }}>Протокол {p.number}</span>
                  <span style={{ flex: 1 }} />
                  <StatusBadge status={p.status} />
                </div>
                <div className="pmrk-muted" style={{ fontSize: 12, marginTop: 3 }}>{p.body} · {dateRu(p.date)}</div>
                <div className="pmrk-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{p.decisions.length} решений по КЛ</div>
              </div>
            );
          })}
        </div>

        {/* ДЕТЕЙЛ — выбранный протокол */}
        <div>
          <SectionCard title={`Протокол ${proto.number}`} extra={<StatusBadge status={proto.status} />}>
            <KeyValue
              cols={3}
              items={[
                { k: 'Коллегиальный орган', v: proto.body },
                ...(proto.subsidiary ? [{ k: 'ДО', v: proto.subsidiary }] : []),
                { k: 'Дата протокола', v: dateRu(proto.date) },
                { k: 'Решений по КЛ', v: String(proto.decisions.length) },
                { k: 'Вложения', v: proto.attachments.length ? proto.attachments.join(', ') : '—' },
              ]}
            />
          </SectionCard>

          <SectionCard
            title="Принятые решения по КЛ"
            extra={proto.status === 'Подготовлено КК' ? <Button size="xs" view="secondary" label="Добавить заявку «Подготовлено КК»" iconLeft={IconAdd as never} onClick={() => setAddOpen((v) => !v)} /> : undefined}
          >
            <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 8 }}>Выберите решение, чтобы увидеть его путь «заявка → протокол → лимит».</div>
            <div className="pmrk-table">
              <div className="pmrk-table__head">
                <div className="pmrk-th" style={{ flex: 1 }}>Заявка</div>
                <div className="pmrk-th" style={{ flex: 1.8 }}>Контрагент</div>
                <div className="pmrk-th" style={{ flex: 1.1 }}>Действие</div>
                <div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Лимит, руб.</div>
                <div className="pmrk-th" style={{ flex: 1.1 }}>Решение</div>
              </div>
              {proto.decisions.map((d, i) => (
                <div key={d.ref} className="pmrk-tr" style={{ background: i === selDec ? 'var(--color-bg-secondary)' : undefined }} onClick={() => setSelDec(i)}>
                  <div className="pmrk-td" style={{ flex: 1, fontWeight: 600 }}>{d.ref}</div>
                  <div className="pmrk-td" style={{ flex: 1.8 }}>{d.counterparty}</div>
                  <div className="pmrk-td" style={{ flex: 1.1 }}>{d.action}</div>
                  <div className="pmrk-td pmrk-tnum" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex' }}>{d.limit ? moneyCompact(d.limit) : '—'}</div>
                  <div className="pmrk-td" style={{ flex: 1.1 }}><DecisionBadge status={d.status} /></div>
                </div>
              ))}
            </div>

            {addOpen && <AddDecisionDemo ko={proto.body} />}

            <div className="pmrk-muted" style={{ fontSize: 12, marginTop: 10 }}>
              При добавлении заявки выполняется контроль соответствия коллегиального органа уровню утверждения заявки (ФТ-6.10). Добавляются только заявки со статусом «Подготовлено КК».
            </div>
          </SectionCard>

          {/* КОНТЕКСТНАЯ связь по выбранному решению */}
          <SectionCard title="Связь по выбранному решению">
            <div className="pmrk-route">
              <div className="pmrk-route__step pmrk-route__step--done" style={{ cursor: dec.lrId ? 'pointer' : 'default' }} onClick={() => dec.lrId && navigate(`/limit-requests/${dec.lrId}`)}>
                <div className="pmrk-route__num">Источник · заявка</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{dec.ref} {dec.lrId && <IconForward size="xs" style={{ verticalAlign: 'middle' }} />}</div>
                <div className="pmrk-muted" style={{ fontSize: 11 }}>{dec.counterparty} · {dec.action} · {dec.limit ? moneyCompactText(dec.limit) : '—'}</div>
              </div>
              <div className="pmrk-route__step pmrk-route__step--current">
                <div className="pmrk-route__num">Решение · протокол</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Протокол {proto.number}</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>{proto.body} · {dateRu(proto.date)}</div>
              </div>
              <div
                className="pmrk-route__step"
                style={{ background: `color-mix(in srgb, ${DECISION_COLOR[dec.status]} 14%, var(--color-bg-default))`, border: `1px solid ${DECISION_COLOR[dec.status]}` }}
              >
                <div className="pmrk-route__num">Результат</div>
                <div style={{ fontWeight: 600, fontSize: 13, color: DECISION_COLOR[dec.status] }}>
                  {dec.status === 'Утверждено' ? 'Лимит утверждён' : dec.status === 'Согласовано' ? 'Согласовано' : dec.status === 'Отклонено' ? 'Отклонено' : 'На рассмотрении КК'}
                </div>
                <div className="pmrk-muted" style={{ fontSize: 11 }}>
                  {dec.status === 'Утверждено' ? `${moneyCompactText(dec.limit)} · действует` : dec.status === 'Согласовано' ? 'ожидает утверждения КО' : dec.status === 'Отклонено' ? 'лимит не установлен' : 'решение не принято'}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <Modal isOpen={createOpen} onClickOutside={() => setCreateOpen(false)} onEsc={() => setCreateOpen(false)}>
        <NewProtocolForm onClose={() => setCreateOpen(false)} />
      </Modal>
    </div>
  );
}

/* Демонстрация контроля «КО ↔ уровень утверждения» (ФТ-6.10). */
function AddDecisionDemo({ ko }: { ko: string }) {
  const eligible = [
    { ref: 'КЛ-2026-0481', cp: 'ООО «Торговый дом Прогресс»', level: 'Кредитный контролёр Департамента' },
    { ref: 'КЛ-2026-0484', cp: 'ООО «ОптТопливо-3290»', level: 'Кредитный контролёр Блока' },
  ];
  const [error, setError] = useState<string | null>(null);
  // упрощённая матрица: КО должен соответствовать уровню утверждения заявки
  const koLevel = ko.replace('Кредитный комитет', 'Кредитный контролёр');
  return (
    <div style={{ marginTop: 12, padding: 12, border: '1px dashed var(--color-bg-border)', borderRadius: 10, background: 'var(--color-bg-secondary)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Заявки «Подготовлено КК» для добавления</div>
      {eligible.map((e) => {
        const ok = e.level === koLevel;
        return (
          <div key={e.ref} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--color-bg-border)' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{e.ref}</span> <span className="pmrk-muted" style={{ fontSize: 12 }}>· {e.cp}</span>
              <div className="pmrk-muted" style={{ fontSize: 11 }}>Уровень утверждения: {e.level}</div>
            </div>
            <Button size="xs" view="ghost" label="Добавить" onClick={() => setError(ok ? null : `Коллегиальный орган «${ko}» не соответствует уровню утверждения заявки ${e.ref} («${e.level}»). Добавление невозможно.`)} />
          </div>
        );
      })}
      {error && <div style={{ marginTop: 8, color: 'var(--pmrk-risk-4)', fontSize: 12.5 }}>⚠ {error}</div>}
    </div>
  );
}

function NewProtocolForm({ onClose }: { onClose: () => void }) {
  const [ko, setKo] = useState('Кредитный комитет ДО');
  const sel: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', border: '1px solid var(--color-bg-border)', borderRadius: 8, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', outline: 'none', fontSize: 13 };
  return (
    <div style={{ padding: 20, width: 560, maxWidth: '92vw' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Новый протокол КО</h3>
        <Button size="xs" view="clear" label="✕" onClick={onClose} />
      </div>
      <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 14 }}>Вкладка «Параметры протокола». Решения по КЛ добавляются после создания на вкладке «Принятые решения по КЛ».</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <label><div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>Дата протокола *</div><input type="date" style={sel} /></label>
        <label><div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>Номер протокола *</div><input placeholder="№ 20" style={sel} /></label>
        <label><div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>Коллегиальный орган *</div>
          <select value={ko} onChange={(e) => setKo(e.target.value)} style={sel}>
            <option>Кредитный комитет ГПН</option>
            <option>Кредитный комитет Блока</option>
            <option>Кредитный комитет Департамента</option>
            <option>Кредитный комитет ДО</option>
          </select>
        </label>
        {ko === 'Кредитный комитет ДО' && (
          <label><div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>ДО *</div>
            <select style={sel}><option>ООО «Газпромнефть-Региональные продажи»</option><option>ООО «Газпромнефть-Логистика»</option><option>ООО «Газпромнефть — смазочные материалы»</option></select>
          </label>
        )}
        <div style={{ gridColumn: '1 / -1' }}><div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>Вложения</div><FileDrop hint="PDF, XLSX, DOCX · протокол и приложения" accept=".pdf,.xlsx,.docx,.doc" /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button size="s" view="ghost" label="Отмена" onClick={onClose} />
        <Button size="s" label="Создать протокол" onClick={onClose} />
      </div>
    </div>
  );
}
