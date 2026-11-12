/**
 * Дневник похода (просьба Артура 2026-11-12): задачи главы — что можно сделать сейчас, что ещё закрыто и
 * зачем нужно. «Показать» ведёт камеру к объекту. Список строит src/campaign/journal.ts.
 */
import { Journal, JournalTask } from '../campaign/journal';
import { WorldObj, RegionDef, resText } from '../campaign/world';

const KIND_ICON: Record<WorldObj['kind'], string> = { camp: '⛺', squad: '⚔', fortress: '🏰', chest: '📦', mine: '⛏', shrine: '🗿', event: '❓' };
const KIND_HINT: Record<WorldObj['kind'], string> = {
  camp: 'Лагерь',
  squad: 'Бой',
  fortress: 'Бой с армией, последний в главе',
  chest: 'Сундук',
  mine: 'Бой за промысел',
  shrine: 'Святилище',
  event: 'Встреча с выбором',
};

function Row({ t, onShow }: { t: JournalTask; onShow: (o: WorldObj) => void }) {
  const o = t.obj;
  const reward = resText(o.reward);
  const income = resText(o.income);
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2 ${t.locked ? 'border-[#2d2938] bg-black/20 opacity-80' : 'border-[#3b354a] bg-black/30'}`}>
      <span className="text-xl leading-none mt-0.5">{t.locked ? '🔒' : KIND_ICON[o.kind]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-amber-100">{o.name}</span>
          <span className="text-[11px] text-stone-400">{KIND_HINT[o.kind]}{o.waves && o.kind !== 'fortress' ? `, ${o.waves} волн` : ''}</span>
          {!t.required && <span className="text-[10px] px-1 rounded bg-[#2a2635] text-stone-300">по желанию</span>}
        </div>
        {t.locked ? (
          <div className="text-xs text-stone-400">Сначала: {t.locked}</div>
        ) : (
          <div className="text-xs text-stone-300">
            {reward && <span>Награда: {reward}. </span>}
            {income && <span>Доход: {income} в день. </span>}
            <span className="text-stone-500">{t.dist} гекс. от героя</span>
          </div>
        )}
      </div>
      <button className="px-2 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448] text-xs font-bold shrink-0" onClick={() => onShow(o)}>
        Показать
      </button>
    </div>
  );
}

export function JournalPanel({ journal, region, onShow, onClose }: { journal: Journal; region: RegionDef; onShow: (o: WorldObj) => void; onClose: () => void }) {
  const { goal } = journal;
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-2 sm:p-4 z-20" onClick={onClose}>
      <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-3 sm:p-4 w-full max-w-2xl max-h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-lg font-black text-amber-300">Дневник · {region.name}</h3>
          <span className="text-xs text-stone-400">
            выполнено {journal.done} из {journal.total}
          </span>
          <span className="flex-1" />
          <button className="px-3 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448] font-bold" onClick={onClose}>
            ✕
          </button>
        </div>
        {goal ? (
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">Главная задача</div>
            <Row t={goal} onShow={onShow} />
          </div>
        ) : (
          <div className="mb-3 text-sm text-amber-200">Главная задача выполнена: артефакт этой главы наш.</div>
        )}
        {journal.open.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">Можно сделать сейчас</div>
            <div className="flex flex-col gap-1.5">
              {journal.open.map((t) => (
                <Row key={t.obj.id} t={t} onShow={onShow} />
              ))}
            </div>
          </div>
        )}
        {journal.locked.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">Пока закрыто</div>
            <div className="flex flex-col gap-1.5">
              {journal.locked.map((t) => (
                <Row key={t.obj.id} t={t} onShow={onShow} />
              ))}
            </div>
          </div>
        )}
        {journal.choices.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">Решения</div>
            <ul className="text-xs text-stone-300 list-disc pl-4">
              {journal.choices.map((c) => (
                <li key={c.name}>
                  {c.name}: {c.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
