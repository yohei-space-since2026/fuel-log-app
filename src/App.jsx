import { useState, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Fuel, TrendingUp, Trash2, Gauge, Calendar, Settings2, Pencil, X, Check, Download } from "lucide-react";
import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Theme — plain JS object, applied via inline styles. (Arbitrary-value
// Tailwind classes like bg-[#1E2227] need a JIT compiler that isn't
// available in this environment, so colors go through style= instead.)
// ---------------------------------------------------------------------------
const C = {
  bg: "#14171A",
  panel: "#1E2227",
  panelRaised: "#262B31",
  border: "#3A4048",
  inputBg: "#0D0F11",
  text: "#F3F1EC",
  textMuted: "#A8AEB6",
  textFaint: "#6E747C",
  amber: "#F2A93B",
  amberDark: "#14171A",
  good: "#5FD3A6",
  bad: "#E1573F",
};

const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12 };
const input = {
  background: C.inputBg,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  padding: "10px 12px",
  fontFamily: "monospace",
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
};
const label = { fontSize: 12, color: C.textMuted, marginBottom: 6, display: "block" };
const dateInput = { ...input, appearance: "none", WebkitAppearance: "none", minWidth: 0, maxWidth: "100%" };

// ---------------------------------------------------------------------------
// Fuel types — covers liquid fuels plus EV/hydrogen, each with its own
// volume/price/efficiency units so labels stay accurate throughout the app.
// ---------------------------------------------------------------------------
const FUEL_TYPES = [
  { id: "regular", label: "レギュラー" },
  { id: "diesel", label: "軽油" },
  { id: "premium", label: "ハイオク" },
  { id: "ev", label: "電気(EV)" },
  { id: "hydrogen", label: "水素" },
];

const UNIT_CONFIG = {
  regular: { volumeLabel: "給油量", volumeUnit: "L", priceUnit: "円/L", effUnit: "km/L", amountPlaceholder: "例: 32.5", fullTankLabel: "満タン給油" },
  diesel: { volumeLabel: "給油量", volumeUnit: "L", priceUnit: "円/L", effUnit: "km/L", amountPlaceholder: "例: 32.5", fullTankLabel: "満タン給油" },
  premium: { volumeLabel: "給油量", volumeUnit: "L", priceUnit: "円/L", effUnit: "km/L", amountPlaceholder: "例: 32.5", fullTankLabel: "満タン給油" },
  ev: { volumeLabel: "充電量", volumeUnit: "kWh", priceUnit: "円/kWh", effUnit: "km/kWh", amountPlaceholder: "例: 40", fullTankLabel: "満充電" },
  hydrogen: { volumeLabel: "充填量", volumeUnit: "kg", priceUnit: "円/kg", effUnit: "km/kg", amountPlaceholder: "例: 4.5", fullTankLabel: "満タン充填" },
};

function unitsFor(fuelType) {
  return UNIT_CONFIG[fuelType] || UNIT_CONFIG.regular;
}

// ---------------------------------------------------------------------------
// Data layer — reads/writes the `setup` and `entries` tables in Supabase.
// UI components are unaware of this and just call setSetup/addEntry/etc.
// ---------------------------------------------------------------------------
function setupFromRow(row) {
  if (!row) return null;
  return {
    carName: row.car_name ?? "",
    fuelType: row.fuel_type ?? "regular",
    startDate: row.start_date,
    baseOdo: Number(row.base_odo),
  };
}

function setupToRow(setup) {
  return {
    id: 1,
    car_name: setup.carName || null,
    fuel_type: setup.fuelType || "regular",
    start_date: setup.startDate,
    base_odo: setup.baseOdo,
    updated_at: new Date().toISOString(),
  };
}

function entryFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    odo: Number(row.odo),
    amount: Number(row.amount),
    totalPaid: Number(row.total_paid),
    discountPerLiter: Number(row.discount_per_liter) || 0,
    fullTank: row.full_tank,
  };
}

function entryToRow(entry) {
  return {
    date: entry.date,
    odo: entry.odo,
    amount: entry.amount,
    total_paid: entry.totalPaid,
    discount_per_liter: entry.discountPerLiter || 0,
    full_tank: entry.fullTank,
  };
}

function useFuelData() {
  const [setup, setSetupState] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [setupRes, entriesRes] = await Promise.all([
        supabase.from("setup").select("*").eq("id", 1).maybeSingle(),
        supabase.from("entries").select("*").order("odo", { ascending: true }),
      ]);
      if (cancelled) return;
      if (setupRes.error) setError(setupRes.error.message);
      else setSetupState(setupFromRow(setupRes.data));
      if (entriesRes.error) setError(entriesRes.error.message);
      else setEntries((entriesRes.data || []).map(entryFromRow));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSetup = async (data) => {
    setSetupState(data); // optimistic
    const { error: err } = await supabase.from("setup").upsert(setupToRow(data));
    if (err) setError(err.message);
  };

  const addEntry = async (entry) => {
    const { data, error: err } = await supabase.from("entries").insert(entryToRow(entry)).select().single();
    if (err) {
      setError(err.message);
      return;
    }
    setEntries((prev) => [...prev, entryFromRow(data)]);
  };

  const updateEntry = async (id, patch) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e))); // optimistic
    const { error: err } = await supabase.from("entries").update(entryToRow(patch)).eq("id", id);
    if (err) setError(err.message);
  };

  const removeEntry = async (id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id)); // optimistic
    const { error: err } = await supabase.from("entries").delete().eq("id", id);
    if (err) setError(err.message);
  };

  return { setup, setSetup, entries, addEntry, updateEntry, removeEntry, loading, error };
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function DigitReadout({ value, unit }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <div style={{ display: "flex", gap: 2 }}>
        {value.split("").map((ch, i) => (
          <div
            key={i}
            style={{
              width: 30,
              height: 42,
              background: C.inputBg,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "monospace",
              fontSize: 22,
              color: C.amber,
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.6)",
            }}
          >
            {ch}
          </div>
        ))}
      </div>
      {unit && <span style={{ fontSize: 12, color: C.textMuted, fontFamily: "monospace" }}>{unit}</span>}
    </div>
  );
}

function StatCard({ label: lbl, value, unit, accent = C.amber, icon: Icon, date, count }) {
  return (
    <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.textMuted, fontSize: 12 }}>
        {Icon && <Icon size={13} />}
        <span>{lbl}</span>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 24, color: accent }}>
        {value}
        {unit && <span style={{ fontSize: 13, color: C.textMuted, marginLeft: 4 }}>{unit}</span>}
      </div>
      {date && (
        <div>
          <span style={{ fontSize: 11, color: C.textFaint, fontFamily: "monospace" }}>{date}</span>
          {count > 1 && (
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              他 {count - 1}件
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, onLabel, offLabel }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 46,
          height: 26,
          borderRadius: 999,
          background: checked ? C.amber : C.panelRaised,
          border: `1px solid ${checked ? C.amber : C.border}`,
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: checked ? C.inputBg : C.textFaint,
            position: "absolute",
            top: 2,
            left: checked ? 23 : 2,
            transition: "left 0.15s",
          }}
        />
      </div>
      <span style={{ fontSize: 14, color: checked ? C.text : C.textMuted, fontWeight: 600 }}>
        {checked ? onLabel : offLabel}
      </span>
    </button>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.text, marginBottom: 4 }}>
      <Icon size={18} color={C.amber} />
      <h2 style={{ fontWeight: 600, margin: 0 }}>{children}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function SetupForm({ onSave, initial, onCancel }) {
  const [carName, setCarName] = useState(initial?.carName ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? new Date().toISOString().slice(0, 10));
  const [baseOdo, setBaseOdo] = useState(initial ? String(initial.baseOdo) : "");
  const [fuelType, setFuelType] = useState(initial?.fuelType ?? "regular");

  return (
    <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionTitle icon={Settings2}>{initial ? "設定を編集" : "初期設定"}</SectionTitle>
      {!initial && (
        <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, margin: 0 }}>
          記録を始める日と、その時点でのODOメーター(走行距離計)の値を入力してください。
        </p>
      )}
      <label style={{ display: 'block', width: '100%' }}>
        <span style={label}>車名(任意)</span>
        <input
          type="text"
          value={carName}
          onChange={(e) => setCarName(e.target.value)}
          placeholder="例: プリウス"
          style={input}
        />
      </label>
      <div>
        <span style={label}>燃料の種類</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
          {FUEL_TYPES.map((f) => (
            <button
              key={f.id}
              onClick={() => setFuelType(f.id)}
              style={{
                padding: "8px 2px",
                borderRadius: 8,
                border: `1px solid ${fuelType === f.id ? C.amber : C.border}`,
                background: fuelType === f.id ? "rgba(242,169,59,0.12)" : "transparent",
                color: fuelType === f.id ? C.amber : C.textMuted,
                fontSize: 10.5,
                lineHeight: 1.3,
                whiteSpace: "normal",
                wordBreak: "keep-all",
                textAlign: "center",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <label style={{ display: 'block', width: '100%' }}>
        <span style={label}>記録開始日</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={dateInput} />
      </label>
      <label style={{ display: 'block', width: '100%' }}>
        <span style={label}>基準ODOメーター (km)</span>
        <input
          type="number"
          inputMode="numeric"
          value={baseOdo}
          onChange={(e) => setBaseOdo(e.target.value)}
          placeholder="例: 42000"
          style={input}
        />
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        {initial && (
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: C.panelRaised,
              color: C.textMuted,
              fontWeight: 700,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "13px 0",
            }}
          >
            キャンセル
          </button>
        )}
        <button
          disabled={!baseOdo}
          onClick={() => onSave({ carName, startDate, baseOdo: Number(baseOdo), fuelType })}
          style={{
            flex: initial ? 2 : 1,
            background: baseOdo ? C.amber : C.panelRaised,
            color: baseOdo ? C.amberDark : C.textFaint,
            fontWeight: 700,
            border: "none",
            borderRadius: 8,
            padding: "13px 0",
          }}
        >
          {initial ? "保存する" : "この内容で始める"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry form — used both for adding a new fill-up and editing an existing one
// ---------------------------------------------------------------------------
const DISCOUNT_CHIPS = [0, 3, 5, 10];

function EntryForm({ lastOdo, lastDate, startDate, units = UNIT_CONFIG.regular, initial, onSubmit, onCancel }) {
  const freshState = () => ({
    date: new Date().toISOString().slice(0, 10),
    odo: "",
    amount: "",
    totalPaid: "",
    fullTank: true,
  });

  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [odo, setOdo] = useState(initial ? String(initial.odo) : "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [totalPaid, setTotalPaid] = useState(initial ? String(initial.totalPaid) : "");
  const [fullTank, setFullTank] = useState(initial?.fullTank ?? true);
  const [discountChip, setDiscountChip] = useState(
    initial && !DISCOUNT_CHIPS.includes(initial.discountPerLiter) ? "custom" : String(initial?.discountPerLiter ?? 0)
  );
  const [customDiscount, setCustomDiscount] = useState(
    initial && !DISCOUNT_CHIPS.includes(initial.discountPerLiter) ? String(initial.discountPerLiter) : ""
  );
  const [savedMsg, setSavedMsg] = useState(null);

  const odoNum = Number(odo);
  const floor = initial?.prevOdoBound ?? lastOdo;
  const validOdo = odo !== "" && odoNum > floor;
  const dateTooEarly = startDate && date < startDate;
  const dateBeforeLast = !dateTooEarly && lastDate && date < lastDate;
  const canSubmit = validOdo && amount && totalPaid && !dateTooEarly;
  const liveDistance = validOdo ? odoNum - floor : null;

  const computedPrice = amount && totalPaid ? Number(totalPaid) / Number(amount) : null;
  const discountPerLiter = discountChip === "custom" ? Math.abs(Number(customDiscount || 0)) : Number(discountChip);

  const submit = () => {
    const amt = Number(amount);
    const paid = Number(totalPaid);
    onSubmit({
      date,
      odo: odoNum,
      amount: amt,
      totalPaid: paid,
      discountPerLiter,
      fullTank,
    });

    if (!initial) {
      setSavedMsg("登録完了!");
      const fresh = freshState();
      setDate(fresh.date);
      setOdo(fresh.odo);
      setAmount(fresh.amount);
      setTotalPaid(fresh.totalPaid);
      setFullTank(fresh.fullTank);
      setDiscountChip("0");
      setCustomDiscount("");
      setTimeout(() => setSavedMsg(null), 1400);
    }
  };

  return (
    <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 16, position: "relative", overflow: "hidden" }}>
      {savedMsg && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(20,23,26,0.94)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            zIndex: 10,
            animation: "toastPop 1.4s ease forwards",
          }}
        >
          <Check size={30} color={C.amber} />
          <span style={{ fontFamily: "monospace", fontSize: 24, letterSpacing: 0.5, color: C.amber }}>{savedMsg}</span>
        </div>
      )}
      <SectionTitle icon={initial ? Pencil : Fuel}>{initial ? "給油記録を編集" : "給油を記録"}</SectionTitle>

      <label style={{ display: 'block', width: '100%' }}>
        <span style={label}>日付{lastDate && ` ・前回 ${lastDate}`}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={dateInput} />
        {dateTooEarly && (
          <span style={{ fontSize: 12, color: C.bad, marginTop: 4, display: "block" }}>
            記録開始日({startDate})より前の日付は登録できません
          </span>
        )}
        {dateBeforeLast && (
          <span style={{ fontSize: 12, color: C.amber, marginTop: 4, display: "block" }}>
            前回の記録({lastDate})より過去の日付です。ODOメーターの整合性を確認してください
          </span>
        )}
      </label>

      <label style={{ display: 'block', width: '100%' }}>
        <span style={label}>ODOメーター (km) ・前回 {floor.toLocaleString()}</span>
        <input
          type="number"
          inputMode="numeric"
          value={odo}
          onChange={(e) => setOdo(e.target.value)}
          placeholder="現在の走行距離計"
          style={{ ...input, border: `1px solid ${odo && !validOdo ? C.bad : C.border}` }}
        />
        {odo && !validOdo && (
          <span style={{ fontSize: 12, color: C.bad, marginTop: 4, display: "block" }}>
            前回の値より大きい数字を入力してください
          </span>
        )}
        {liveDistance !== null && (
          <span style={{ fontSize: 13, color: C.textMuted, marginTop: 6, display: "block", fontFamily: "monospace" }}>
            走行距離: <span style={{ color: C.amber }}>{liveDistance.toLocaleString()}km</span>
          </span>
        )}
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: 'block', width: '100%' }}>
          <span style={label}>{units.volumeLabel} ({units.volumeUnit})</span>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={units.amountPlaceholder}
            style={input}
          />
        </label>
        <label style={{ display: 'block', width: '100%' }}>
          <span style={label}>合計支払金額 (円)</span>
          <input
            type="number"
            inputMode="decimal"
            value={totalPaid}
            onChange={(e) => setTotalPaid(e.target.value)}
            placeholder="レシートの金額"
            style={input}
          />
        </label>
      </div>

      {computedPrice !== null && (
        <div style={{ fontSize: 13, color: C.textMuted, fontFamily: "monospace" }}>
          単価(記録): <span style={{ color: C.amber }}>{Math.round(computedPrice)}{units.priceUnit}</span>
        </div>
      )}

      <div>
        <span style={label}>割引</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DISCOUNT_CHIPS.map((v) => (
            <button
              key={v}
              onClick={() => setDiscountChip(String(v))}
              style={{
                padding: "7px 13px",
                borderRadius: 999,
                border: `1px solid ${discountChip === String(v) ? C.good : C.border}`,
                background: discountChip === String(v) ? "rgba(95,211,166,0.12)" : "transparent",
                color: discountChip === String(v) ? C.good : C.textMuted,
                fontSize: 12,
                fontFamily: "monospace",
              }}
            >
              {v === 0 ? "なし" : `-${v}${units.priceUnit}`}
            </button>
          ))}
          <button
            onClick={() => setDiscountChip("custom")}
            style={{
              padding: "7px 13px",
              borderRadius: 999,
              border: `1px solid ${discountChip === "custom" ? C.good : C.border}`,
              background: discountChip === "custom" ? "rgba(95,211,166,0.12)" : "transparent",
              color: discountChip === "custom" ? C.good : C.textMuted,
              fontSize: 12,
              fontFamily: "monospace",
            }}
          >
            その他
          </button>
        </div>
        {discountChip === "custom" && (
          <input
            type="number"
            inputMode="decimal"
            value={customDiscount}
            onChange={(e) => setCustomDiscount(e.target.value.replace("-", ""))}
            placeholder="「−」は付けずに数字だけ入力"
            style={{ ...input, marginTop: 8 }}
          />
        )}
      </div>

      <div>
        <Toggle checked={fullTank} onChange={setFullTank} onLabel={units.fullTankLabel} offLabel={`${units.fullTankLabel}ではない`} />
        <p style={{ fontSize: 12, color: C.textFaint, marginTop: 8, lineHeight: 1.6 }}>
          燃費計算は{units.fullTankLabel}法です。OFFにするとこの区間は燃費計算から除外されます。
        </p>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {initial && (
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: C.panelRaised,
              color: C.textMuted,
              fontWeight: 700,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "13px 0",
            }}
          >
            キャンセル
          </button>
        )}
        <button
          disabled={!canSubmit}
          onClick={submit}
          style={{
            flex: 2,
            background: canSubmit ? C.amber : C.panelRaised,
            color: canSubmit ? C.amberDark : C.textFaint,
            fontWeight: 700,
            border: "none",
            borderRadius: 8,
            padding: "13px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {initial ? <Check size={18} /> : <Plus size={18} />}
          {initial ? "保存する" : "記録する"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------
function computeRows(setup, entries) {
  const sorted = [...entries].sort((a, b) => a.odo - b.odo);
  let prevOdo = setup.baseOdo;
  const rows = sorted.map((e) => {
    const distance = e.odo - prevOdo;
    const efficiency = e.fullTank && distance > 0 ? distance / e.amount : null;
    const price = e.totalPaid / e.amount; // recorded unit price, derived from what was actually paid
    const cost = e.totalPaid;
    const referenceDiscount = (e.discountPerLiter || 0) * e.amount; // informational only
    const row = { ...e, distance, efficiency, price, cost, referenceDiscount, prevOdoBound: prevOdo };
    prevOdo = e.odo;
    return row;
  });
  return rows;
}

function pickExtreme(rows, valueFn, roundFn, mode) {
  if (!rows.length) return null;
  let bestRounded = null;
  rows.forEach((r) => {
    const v = roundFn(valueFn(r));
    if (bestRounded === null || (mode === "max" ? v > bestRounded : v < bestRounded)) bestRounded = v;
  });
  const matches = rows.filter((r) => roundFn(valueFn(r)) === bestRounded);
  matches.sort((a, b) => b.date.localeCompare(a.date)); // most recent first
  const latest = matches[0];
  return { value: valueFn(latest), date: latest.date, count: matches.length };
}

function computeStats(rows) {
  const withEff = rows.filter((r) => r.efficiency !== null);
  const totalDistance = withEff.reduce((s, r) => s + r.distance, 0);
  const totalFuel = withEff.reduce((s, r) => s + r.amount, 0);
  const avgEfficiency = totalFuel > 0 ? totalDistance / totalFuel : null;

  const best = pickExtreme(withEff, (r) => r.efficiency, (v) => Math.round(v * 100) / 100, "max");
  const highest = pickExtreme(rows, (r) => r.price, (v) => Math.round(v), "max");
  const lowest = pickExtreme(rows, (r) => r.price, (v) => Math.round(v), "min");

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  return {
    avgEfficiency,
    bestEfficiency: best?.value ?? null,
    bestEfficiencyDate: best?.date ?? null,
    bestEfficiencyCount: best?.count ?? 0,
    highestPrice: highest?.value ?? null,
    highestPriceDate: highest?.date ?? null,
    highestPriceCount: highest?.count ?? 0,
    lowestPrice: lowest?.value ?? null,
    lowestPriceDate: lowest?.date ?? null,
    lowestPriceCount: lowest?.count ?? 0,
    totalDistance,
    totalCost,
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
function exportCsv(rows, units = UNIT_CONFIG.regular, setup) {
  const fuelLabel = FUEL_TYPES.find((f) => f.id === setup?.fuelType)?.label ?? "レギュラー";
  const infoLines = [
    `車名,${setup?.carName || "(未設定)"}`,
    `燃料の種類,${fuelLabel}`,
    `記録開始日,${setup?.startDate ?? ""}`,
    `基準ODOメーター(km),${setup?.baseOdo ?? ""}`,
  ];
  const header = [
    "日付",
    "ODO(km)",
    "走行距離(km)",
    `${units.volumeLabel}(${units.volumeUnit})`,
    `単価(${units.priceUnit})`,
    "合計金額(円)",
    `割引(${units.priceUnit},参考)`,
    units.fullTankLabel,
    `燃費(${units.effUnit})`,
  ];
  const lines = rows.map((r) =>
    [
      r.date,
      r.odo,
      r.distance,
      r.amount,
      Math.round(r.price),
      r.cost,
      r.discountPerLiter || 0,
      r.fullTank ? "はい" : "いいえ",
      r.efficiency !== null ? r.efficiency.toFixed(2) : "",
    ].join(",")
  );
  const csv = "\uFEFF" + [...infoLines, "", header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuel-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
function HistoryList({ rows, units = UNIT_CONFIG.regular, setup, lastDate, onUpdate, onRemove }) {
  const [editingId, setEditingId] = useState(null);

  if (rows.length === 0) {
    return (
      <div style={{ ...card, padding: 32, textAlign: "center", color: C.textFaint, fontSize: 14 }}>
        まだ記録がありません。「記録」タブから給油を追加してください。
      </div>
    );
  }

  const editingRow = rows.find((r) => r.id === editingId);
  if (editingRow) {
    return (
      <EntryForm
        initial={editingRow}
        units={units}
        startDate={setup?.startDate}
        lastDate={lastDate}
        onCancel={() => setEditingId(null)}
        onSubmit={(patch) => {
          onUpdate(editingId, patch);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        onClick={() => exportCsv(rows, units, setup)}
        style={{
          alignSelf: "flex-end",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: C.panelRaised,
          border: `1px solid ${C.border}`,
          color: C.textMuted,
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
        }}
      >
        <Download size={13} />
        CSVで書き出す
      </button>
      {[...rows].reverse().map((r) => (
        <div key={r.id} style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.textMuted, fontSize: 12 }}>
              <Calendar size={12} />
              {r.date}
              {!r.fullTank && (
                <span
                  style={{
                    fontSize: 10,
                    background: "rgba(242,169,59,0.15)",
                    color: C.amber,
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  {units.fullTankLabel}なし
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <button onClick={() => setEditingId(r.id)} style={{ background: "none", border: "none", color: C.textMuted, padding: 0 }}>
                <Pencil size={15} />
              </button>
              <button onClick={() => onRemove(r.id)} style={{ background: "none", border: "none", color: C.textMuted, padding: 0 }}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "monospace", fontSize: 19, color: C.text }}>
              {r.efficiency !== null ? r.efficiency.toFixed(2) : "—"}
              <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 4 }}>{units.effUnit}</span>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "monospace" }}>
              {r.distance.toLocaleString()}km ・ {r.amount}{units.volumeUnit} ・ {Math.round(r.price)}{units.priceUnit}
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.textFaint, fontFamily: "monospace", marginTop: 4 }}>
            ODO {r.odo.toLocaleString()} ・ 支払 ¥{r.cost.toLocaleString()}
            {r.discountPerLiter > 0 && (
              <span style={{ color: C.good }}> ・ 割引 -{r.discountPerLiter}{units.priceUnit}(参考)</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function StatsView({ rows, stats, units = UNIT_CONFIG.regular }) {
  const chartData = rows
    .filter((r) => r.efficiency !== null)
    .map((r) => ({ date: r.date.slice(5), efficiency: Number(r.efficiency.toFixed(1)), price: Math.round(r.price) }));

  if (rows.length === 0) {
    return (
      <div style={{ ...card, padding: 32, textAlign: "center", color: C.textFaint, fontSize: 14 }}>
        記録が増えると、ここに統計とグラフが表示されます。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <StatCard label="平均燃費" value={stats.avgEfficiency ? stats.avgEfficiency.toFixed(2) : "—"} unit={units.effUnit} accent={C.good} icon={TrendingUp} />
        <StatCard label="最高燃費" value={stats.bestEfficiency ? stats.bestEfficiency.toFixed(2) : "—"} unit={units.effUnit} icon={Gauge} date={stats.bestEfficiencyDate} count={stats.bestEfficiencyCount} />
        <StatCard label="最高単価" value={stats.highestPrice ? Math.round(stats.highestPrice) : "—"} unit={units.priceUnit} accent={C.bad} icon={Fuel} date={stats.highestPriceDate} count={stats.highestPriceCount} />
        <StatCard label="最低単価" value={stats.lowestPrice ? Math.round(stats.lowestPrice) : "—"} unit={units.priceUnit} accent={C.good} icon={Fuel} date={stats.lowestPriceDate} count={stats.lowestPriceCount} />
        <StatCard label="累計支払額" value={stats.totalCost.toLocaleString()} unit="円" icon={Fuel} />
      </div>

      <div style={{ ...card, padding: 16 }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>総走行距離</span>
        <div style={{ marginTop: 8 }}>
          <DigitReadout value={String(stats.totalDistance)} unit="km" />
        </div>
      </div>

      {chartData.length > 1 && (
        <div style={{ ...card, padding: 16 }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>燃費の推移 ({units.effUnit})</span>
          <div style={{ height: 176, marginTop: 8, marginLeft: -8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="date" stroke={C.textFaint} fontSize={11} tickLine={false} />
                <YAxis stroke={C.textFaint} fontSize={11} tickLine={false} width={30} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 8 }}
                  labelStyle={{ color: C.textMuted }}
                  separator=""
                  formatter={(value) => [`${value.toFixed(1)} ${units.effUnit}`, ""]}
                />
                <Line type="monotone" dataKey="efficiency" stroke={C.good} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {chartData.length > 1 && (
        <div style={{ ...card, padding: 16 }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>単価の推移 ({units.priceUnit})</span>
          <div style={{ height: 176, marginTop: 8, marginLeft: -8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="date" stroke={C.textFaint} fontSize={11} tickLine={false} />
                <YAxis stroke={C.textFaint} fontSize={11} tickLine={false} width={30} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 8 }}
                  labelStyle={{ color: C.textMuted }}
                  separator=""
                  formatter={(value) => [`${Math.round(value)}${units.priceUnit}`, ""]}
                />
                <Line type="monotone" dataKey="price" stroke={C.amber} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function FuelLogApp() {
  const { setup, setSetup, entries, addEntry, updateEntry, removeEntry, loading, error } = useFuelData();
  const [tab, setTab] = useState("add");
  const [editingSetup, setEditingSetup] = useState(false);

  const rows = useMemo(() => (setup ? computeRows(setup, entries) : []), [setup, entries]);
  const stats = useMemo(() => computeStats(rows), [rows]);
  const lastOdo = rows.length ? rows[rows.length - 1].odo : setup?.baseOdo ?? 0;
  const lastDate = rows.length ? rows[rows.length - 1].date : setup?.startDate;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        読み込み中...
      </div>
    );
  }
  const units = unitsFor(setup?.fuelType);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes toastPop {
          0%   { opacity: 0; transform: scale(0.96); }
          12%  { opacity: 1; transform: scale(1); }
          82%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.02); }
        }
      `}</style>
      <header style={{ padding: "24px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Gauge size={20} color={C.amber} />
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              {setup?.carName ? `${setup.carName} 給油ログ` : "給油ログ"}
            </h1>
          </div>
          {setup && !editingSetup && (
            <button
              onClick={() => setEditingSetup(true)}
              style={{ background: "none", border: "none", color: C.textFaint, padding: 6 }}
            >
              <Settings2 size={18} />
            </button>
          )}
        </div>
      </header>

      {error && (
        <div style={{ background: "rgba(225,87,63,0.15)", color: C.bad, fontSize: 12, padding: "8px 20px" }}>
          同期エラー: {error}
        </div>
      )}

      <main style={{ flex: 1, padding: "16px 16px 96px", maxWidth: 420, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {!setup ? (
          <SetupForm onSave={setSetup} />
        ) : editingSetup ? (
          <SetupForm
            initial={setup}
            onCancel={() => setEditingSetup(false)}
            onSave={(data) => {
              setSetup(data);
              setEditingSetup(false);
            }}
          />
        ) : tab === "add" ? (
          <EntryForm lastOdo={lastOdo} lastDate={lastDate} startDate={setup?.startDate} units={units} onSubmit={addEntry} />
        ) : tab === "history" ? (
          <HistoryList rows={rows} units={units} setup={setup} lastDate={lastDate} onUpdate={updateEntry} onRemove={removeEntry} />
        ) : (
          <StatsView rows={rows} stats={stats} units={units} />
        )}
      </main>

      {setup && !editingSetup && (
        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: C.panel,
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-around",
            padding: "8px 0",
            maxWidth: 420,
            margin: "0 auto",
            width: "100%",
          }}
        >
          {[
            { key: "add", label: "記録", icon: Plus },
            { key: "history", label: "履歴", icon: Calendar },
            { key: "stats", label: "統計", icon: TrendingUp },
          ].map(({ key, label: lbl, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "6px 24px",
                borderRadius: 8,
                background: "none",
                border: "none",
                color: tab === key ? C.amber : C.textFaint,
              }}
            >
              <Icon size={20} />
              <span style={{ fontSize: 10 }}>{lbl}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
