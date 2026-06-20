import React, { useState, useMemo } from "react";

/* ============================================================
   THEME — bàn poker 9-max, tông tối, ánh đèn casino
   ============================================================ */
const C = {
  bg: "#0E1714",
  panel: "#16221D",
  panelAlt: "#1C2A23",
  border: "#2B3F36",
  borderLight: "#3A5247",
  gold: "#D9A441",
  goldBright: "#F0C467",
  teal: "#3FA796",
  red: "#E2604F",
  text: "#F2EDE4",
  muted: "#8FA199",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');`;

/* ============================================================
   BÀI & VỊ TRÍ
   ============================================================ */
const RANK_LABELS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const RANK_VALUES = RANK_LABELS.map((_, i) => i + 2); // 2..14
const SUITS = ["s", "h", "d", "c"];
const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_COLOR = { s: C.text, c: C.text, h: C.red, d: C.red };

const POSITIONS = ["UTG", "UTG1", "MP1", "MP2", "HJ", "CO", "BTN", "SB", "BB"];
const POSITION_LABEL = {
  UTG: "UTG", UTG1: "UTG+1", MP1: "MP1", MP2: "MP2", HJ: "HJ",
  CO: "CO", BTN: "BTN", SB: "SB", BB: "BB",
};

function rankLabel(r) { return RANK_LABELS[r - 2]; }
function cardKey(c) { return `${c.r}${c.s}`; }
function cardLabel(c) { return `${rankLabel(c.r)}${SUIT_SYMBOL[c.s]}`; }

/* ============================================================
   CHEN FORMULA — ước lượng độ mạnh bài preflop
   ============================================================ */
function chenScore(c1, c2) {
  const val = (r) => {
    if (r === 14) return 10;
    if (r === 13) return 8;
    if (r === 12) return 7;
    if (r === 11) return 6;
    if (r === 10) return 5;
    return r / 2;
  };
  const high = Math.max(c1.r, c2.r);
  const low = Math.min(c1.r, c2.r);
  const isPair = c1.r === c2.r;
  const suited = c1.s === c2.s;

  let score = val(high);
  if (isPair) score = Math.max(val(high) * 2, 5);

  if (suited) score += 2;

  if (!isPair) {
    const gap = high - low - 1;
    let penalty = 0;
    if (gap === 0) penalty = 0;
    else if (gap === 1) penalty = 1;
    else if (gap === 2) penalty = 2;
    else if (gap === 3) penalty = 4;
    else penalty = 5;
    score -= penalty;
    if ((gap === 0 || gap === 1) && high <= 11) score += 1; // bonus nối thấp hơn Q
  }
  return Math.round(score * 2) / 2; // làm tròn 0.5
}

/* Ngưỡng mở bài (RFI) theo vị trí, 9-max, đơn giản hóa */
const RFI_THRESHOLD = {
  UTG: 9, UTG1: 8.5, MP1: 8, MP2: 7.5, HJ: 6.5, CO: 5.5, BTN: 4.5, SB: 5.5, BB: null,
};

const FACING_LABEL = {
  none: "Mọi người fold / chưa ai vào",
  limped: "Có người limp, chưa ai raise",
  open: "Có 1 raise",
  "3bet": "Đã có 3-bet",
  "4bet": "Đã có 4-bet",
};

function getPreflopAdvice({ position, score, facing, callersBefore }) {
  const n = Math.max(callersBefore || 0, 0);

  // BB: action gấp khúc về tới bạn vì cả bàn fold hết -> ván tự kết thúc, không có quyết định thật sự
  if (position === "BB" && facing === "none") {
    return {
      action: "Check (bạn tự thắng pot)",
      reason: "Cả bàn đã fold trước khi tới lượt bạn, không còn ai để chơi tiếp nên bạn ăn blind luôn, không cần đánh giá bài.",
      score,
    };
  }

  // Pot đã có người limp (gọi), CHƯA ai raise — đây là tình huống dễ bị tính nhầm thành "check" nếu không tách riêng
  if (facing === "limped") {
    if (position === "BB") {
      // BB luôn được xem flop miễn phí nếu check; bài mạnh nên raise isolate để lấy giá trị thay vì check cho không
      const isoTh = 8;
      if (score >= isoTh) {
        return {
          action: `Raise Isolate (~${3 + n}bb)`,
          reason: `Chen score ${score} là bài mạnh (vd AA, KK, AK...). Check ở đây là phí giá trị — nên raise isolate để loại bớt ${n} người limp và xây pot ngay từ preflop.`,
          score,
        };
      }
      return {
        action: "Check",
        reason: `Bạn đã có sẵn BB nên check không mất thêm gì. Chen score ${score} chưa đủ mạnh để raise isolate (ngưỡng ${isoTh}), cứ xem flop miễn phí với ${n} người limp.`,
        score,
      };
    }
    const isoTh = RFI_THRESHOLD[position] ?? 6;
    const limpCallTh = isoTh - 2.5;
    if (score >= isoTh) {
      return {
        action: `Raise Isolate (~${3 + n}bb)`,
        reason: `Chen score ${score} ≥ ngưỡng isolate của ${POSITION_LABEL[position]} (${isoTh}). Nên raise để loại người limp yếu và chủ động kiểm soát pot/vị trí, thay vì limp theo.`,
        score,
      };
    }
    if (score >= limpCallTh) {
      return {
        action: "Limp theo / Call",
        reason: `Bài dạng speculative (suited connector, túi đôi nhỏ...), giá đã rẻ vì có ${n} người limp trước, theo để ăn implied odds khi trúng bộ/sảnh/thùng.`,
        score,
      };
    }
    return {
      action: "Fold",
      reason: `Chen score ${score} dưới ngưỡng tham gia một pot đã có limper (${limpCallTh}), nên bỏ.`,
      score,
    };
  }

  if (facing === "none") {
    const th = RFI_THRESHOLD[position];
    if (score >= th) {
      return {
        action: "Raise (mở đầu ~2.5–3bb)",
        reason: `Chen score ${score} ≥ ngưỡng mở của ${POSITION_LABEL[position]} (${th}). Bài đủ mạnh để raise đầu tiên, không nên limp vì mất chủ động.`,
        score,
      };
    }
    return {
      action: "Fold",
      reason: `Chen score ${score} < ngưỡng mở của ${POSITION_LABEL[position]} (${th}). Bài chưa đủ mạnh để vào ở vị trí này.`,
      score,
    };
  }

  if (facing === "open") {
    const lateAggro = ["BTN", "CO", "SB"].includes(position);
    const threeBetTh = lateAggro ? 9.5 : 10.5;
    const baseCallTh = position === "BB" ? 4 : Math.max((RFI_THRESHOLD[position] ?? 6) - 1, 4.5);
    const callTh = baseCallTh + n * 0.5;
    if (score >= threeBetTh) {
      return {
        action: "3-bet (Raise lại)",
        reason: `Chen score ${score} đủ mạnh để 3-bet lấy giá trị${lateAggro ? " — ở vị trí cuối bàn nên 3-bet rộng hơn để tận dụng fold equity" : ""}.`,
        score,
      };
    }
    if (score >= callTh) {
      return {
        action: "Call",
        reason: `Chen score ${score} đủ để theo kèo open, vị trí ${POSITION_LABEL[position]} (ngưỡng call ~${callTh}${position === "BB" ? ", BB được giá tốt nên defend rộng" : ""}).`,
        score,
      };
    }
    return {
      action: "Fold",
      reason: `Chen score ${score} dưới ngưỡng call (~${callTh}) khi có ${n} người đã vào trước, nên bỏ.`,
      score,
    };
  }

  if (facing === "3bet") {
    const fourBetTh = 12.5;
    const callTh = 10;
    if (score >= fourBetTh) return { action: "4-bet / All-in", reason: `Chen score ${score} là bài top (QQ+/AK), nên 4-bet hoặc shove tùy độ sâu stack.`, score };
    if (score >= callTh) return { action: "Call", reason: `Chen score ${score} đủ mạnh để theo 3-bet (QQ-/AK loại).`, score };
    return { action: "Fold", reason: `Chen score ${score} không đủ để theo một 3-bet, nên bỏ trừ khi có lý do khác (đọc bài đối thủ).`, score };
  }

  // facing 4bet
  const callTh = 13;
  if (score >= callTh) return { action: "Call / All-in", reason: `Chen score ${score} ở nhóm cực mạnh (KK+/AA), có thể theo hoặc shove.`, score };
  return { action: "Fold", reason: `Đối mặt 4-bet, bài cần cực mạnh mới theo được. Chen score ${score} chưa đủ.`, score };
}

/* ============================================================
   ĐÁNH GIÁ BÀI POSTFLOP
   ============================================================ */
function bestStraightHigh(descUnique) {
  for (let i = 0; i <= descUnique.length - 5; i++) {
    let ok = true;
    for (let j = 0; j < 4; j++) {
      if (descUnique[i + j] - descUnique[i + j + 1] !== 1) { ok = false; break; }
    }
    if (ok) return descUnique[i];
  }
  return null;
}

function evaluateHand(cards) {
  const rankCounts = {};
  const suitCounts = {};
  cards.forEach((c) => {
    rankCounts[c.r] = (rankCounts[c.r] || 0) + 1;
    suitCounts[c.s] = (suitCounts[c.s] || 0) + 1;
  });

  let flushSuit = null;
  SUITS.forEach((s) => { if ((suitCounts[s] || 0) >= 5) flushSuit = s; });

  let distinct = Array.from(new Set(cards.map((c) => c.r))).sort((a, b) => b - a);
  let forStraight = [...distinct];
  if (distinct.includes(14)) forStraight.push(1);
  forStraight = Array.from(new Set(forStraight)).sort((a, b) => b - a);
  const straightHigh = bestStraightHigh(forStraight);

  let straightFlushHigh = null;
  if (flushSuit) {
    let fr = Array.from(new Set(cards.filter((c) => c.s === flushSuit).map((c) => c.r))).sort((a, b) => b - a);
    let frs = [...fr];
    if (fr.includes(14)) frs.push(1);
    frs = Array.from(new Set(frs)).sort((a, b) => b - a);
    straightFlushHigh = bestStraightHigh(frs);
  }

  const countsArr = Object.entries(rankCounts)
    .map(([r, c]) => ({ r: Number(r), c }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  let category = 0, label = "Mặt bài cao (High card)", detail = {};
  if (straightFlushHigh) {
    category = 8;
    label = straightFlushHigh === 14 ? "Thùng phá sảnh Hoàng gia" : "Thùng phá sảnh";
  } else if (countsArr[0].c === 4) {
    category = 7; label = "Tứ quý"; detail.quadRank = countsArr[0].r;
  } else if (countsArr[0].c === 3 && countsArr[1] && countsArr[1].c >= 2) {
    category = 6; label = "Cù lũ (Full House)"; detail.tripRank = countsArr[0].r; detail.pairRank = countsArr[1].r;
  } else if (flushSuit) {
    category = 5; label = "Thùng (Flush)";
  } else if (straightHigh) {
    category = 4; label = "Sảnh (Straight)"; detail.high = straightHigh;
  } else if (countsArr[0].c === 3) {
    category = 3; label = "Bộ ba (Trips/Set)"; detail.tripRank = countsArr[0].r;
  } else if (countsArr[0].c === 2 && countsArr[1] && countsArr[1].c === 2) {
    category = 2; label = "Hai đôi"; detail.pairs = [countsArr[0].r, countsArr[1].r];
  } else if (countsArr[0].c === 2) {
    category = 1; label = "Một đôi"; detail.pairRank = countsArr[0].r;
  }

  return { category, label, detail, countsArr };
}

function getPairContext(pairRank, holeCards, board) {
  const isPocket = holeCards.length === 2 && holeCards[0].r === holeCards[1].r;
  const boardRanksDesc = Array.from(new Set(board.map((c) => c.r))).sort((a, b) => b - a);
  if (isPocket && pairRank === holeCards[0].r && !board.some((c) => c.r === pairRank)) {
    if (boardRanksDesc.length === 0) return { tag: "pocket", text: "Túi đôi" };
    if (pairRank > boardRanksDesc[0]) return { tag: "top", text: "Túi đôi cao hơn board (Overpair)" };
    return { tag: "mid", text: "Túi đôi thấp hơn 1 phần board" };
  }
  if (boardRanksDesc.length === 0) return { tag: "mid", text: "Một đôi" };
  if (pairRank === boardRanksDesc[0]) return { tag: "top", text: "Top pair" };
  if (pairRank === boardRanksDesc[boardRanksDesc.length - 1] && boardRanksDesc.length >= 2)
    return { tag: "bottom", text: "Bottom pair" };
  return { tag: "mid", text: "Middle pair" };
}

function detectDraws(allCards, holeCards, board, category) {
  if (category >= 3 || board.length === 0 || board.length >= 5) {
    return { flushDraw: false, straightOuts: 0, overcardOuts: 0, totalOuts: 0 };
  }
  const suitCounts = {};
  allCards.forEach((c) => { suitCounts[c.s] = (suitCounts[c.s] || 0) + 1; });
  let flushDraw = false;
  SUITS.forEach((s) => { if ((suitCounts[s] || 0) === 4) flushDraw = true; });

  let distinct = Array.from(new Set(allCards.map((c) => c.r)));
  let withLowAce = [...distinct];
  if (distinct.includes(14)) withLowAce.push(1);
  const rankSet = new Set(withLowAce);

  const missing = new Set();
  for (let s = 1; s <= 10; s++) {
    const window = [s, s + 1, s + 2, s + 3, s + 4];
    const present = window.filter((r) => rankSet.has(r));
    if (present.length === 4) {
      const miss = window.find((r) => !rankSet.has(r));
      missing.add(miss === 1 ? 14 : miss);
    }
  }
  const straightOuts = missing.size * 4;

  let overcardOuts = 0;
  if (category === 0 && board.length > 0) {
    const boardHigh = Math.max(...board.map((c) => c.r));
    const overs = holeCards.filter((c) => c.r > boardHigh).length;
    overcardOuts = overs * 3;
  }

  const totalOuts = (flushDraw ? 9 : 0) + straightOuts + overcardOuts;
  return { flushDraw, straightOuts, overcardOuts, totalOuts };
}

function getPostflopAdvice({ category, pairCtx, kickerGood, draws, board, potSize, betToCall, numOpponents }) {
  let tier;
  if (category >= 3) tier = "premium";
  else if (category === 2) tier = "strong";
  else if (category === 1) {
    if (pairCtx?.tag === "top" && kickerGood) tier = "strong";
    else if (pairCtx?.tag === "top" || pairCtx?.tag === "pocket") tier = "medium-strong";
    else tier = "medium";
  } else tier = "weak";

  const cardsToCome = board.length === 3 ? 2 : board.length === 4 ? 1 : 0;
  const equityPct = cardsToCome === 2 ? draws.totalOuts * 4 : cardsToCome === 1 ? draws.totalOuts * 2 : 0;
  const equityCapped = Math.min(equityPct, 95);
  const potOddsNeeded = betToCall > 0 ? (betToCall / (potSize + betToCall)) * 100 : 0;
  const multiwayNote = numOpponents >= 3 ? " Lưu ý: nhiều đối thủ trong pot, nên thận trọng hơn với bài trung bình." : "";

  let result;
  if (betToCall <= 0) {
    if (tier === "premium" || tier === "strong") {
      result = { action: "Bet (vào tiền chủ động)", reason: "Bài mạnh, nên chủ động đặt cược để xây pot và bảo vệ bài (gợi ý ~1/2–2/3 pot)." };
    } else if (tier === "medium-strong" || tier === "medium") {
      result = { action: "Check / Bet nhỏ thăm dò", reason: "Bài trung bình, có thể check kiểm soát pot, hoặc bet nhỏ ~1/3 pot để thăm dò." };
    } else if (draws.totalOuts >= 8) {
      result = { action: "Cân nhắc Bet (semi-bluff)", reason: `Draw mạnh (~${draws.totalOuts} outs), bet tạo fold equity và có cửa trúng bài.` };
    } else {
      result = { action: "Check", reason: "Bài chưa có gì đáng kể, không có lý do bỏ tiền vào pot." };
    }
  } else {
    const betPct = potSize > 0 ? (betToCall / potSize) * 100 : 100;
    if (tier === "premium") {
      result = { action: "Raise / Call lớn", reason: "Bài rất mạnh (trips trở lên), nên raise để lấy giá trị tối đa." };
    } else if (tier === "strong") {
      result = { action: "Call / cân nhắc Raise", reason: "Hai đôi trở lên, đủ mạnh để theo thoải mái, có thể raise nếu muốn xây pot." + multiwayNote };
    } else if (tier === "medium-strong") {
      result = betPct <= 50
        ? { action: "Call", reason: "Top pair / overpair, kèo cược không quá lớn so với pot, nên theo." + multiwayNote }
        : { action: "Call thận trọng", reason: "Bài khá nhưng kèo cược lớn, theo dõi phản ứng tiếp theo trước khi bỏ thêm tiền." + multiwayNote };
    } else if (tier === "medium") {
      result = betPct <= 33
        ? { action: "Call", reason: "Mức cược nhỏ, đủ pot odds để theo với bài trung bình." + multiwayNote }
        : { action: "Fold", reason: "Mức cược lớn so với bài chỉ ở mức trung bình, nên bỏ." + multiwayNote };
    } else if (equityCapped > 0) {
      result = equityCapped >= potOddsNeeded
        ? { action: "Call (theo pot odds)", reason: `Equity ước tính ~${equityCapped}% cao hơn mức cần ~${potOddsNeeded.toFixed(1)}% để theo có lời.` }
        : { action: "Fold", reason: `Equity ước tính ~${equityCapped}% thấp hơn mức cần ~${potOddsNeeded.toFixed(1)}%, theo không có lời.` };
    } else {
      result = { action: cardsToCome === 0 ? "Fold (trừ khi đọc bluff)" : "Fold", reason: cardsToCome === 0
        ? "Sông rồi, không còn draw. Bài yếu thì nên bỏ trừ khi bạn có lý do tin đối thủ đang bluff."
        : "Không có bài, không có draw đáng kể, nên bỏ." };
    }
  }
  return { ...result, equityCapped, potOddsNeeded, tier };
}

/* ============================================================
   UI: CardPicker
   ============================================================ */
function CardPicker({ need, value, onChange, disabledKeys }) {
  const usedSet = new Set([...disabledKeys, ...value.map(cardKey)]);
  function pick(card) {
    if (value.length >= need) return;
    if (usedSet.has(cardKey(card))) return;
    onChange([...value, card]);
  }
  function clearSlot(idx) {
    onChange(value.filter((_, i) => i !== idx));
  }
  const slots = Array.from({ length: need });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {slots.map((_, i) => {
          const c = value[i];
          return (
            <button
              key={i}
              onClick={() => c && clearSlot(i)}
              style={{
                width: 52, height: 68, borderRadius: 8,
                background: c ? C.panelAlt : "transparent",
                border: `2px solid ${c ? C.gold : C.border}`,
                color: c ? SUIT_COLOR[c.s] : C.muted,
                fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 20,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: c ? "pointer" : "default",
              }}
            >
              {c ? cardLabel(c) : "—"}
            </button>
          );
        })}
        {value.length > 0 && (
          <button
            onClick={() => onChange([])}
            style={{ alignSelf: "center", marginLeft: 4, background: "none", border: "none", color: C.muted, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
          >
            xóa hết
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: 3 }}>
        {SUITS.map((s) =>
          RANK_VALUES.slice().reverse().map((r) => {
            const card = { r, s };
            const key = cardKey(card);
            const disabled = usedSet.has(key) || value.length >= need;
            return (
              <button
                key={key}
                onClick={() => pick(card)}
                disabled={disabled}
                style={{
                  aspectRatio: "1 / 1.2",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "'Inter', sans-serif",
                  borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  background: usedSet.has(key) ? "#0A0F0D" : C.panel,
                  color: usedSet.has(key) ? "#3A4842" : SUIT_COLOR[s],
                  opacity: disabled && !usedSet.has(key) ? 0.35 : 1,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                {rankLabel(r)}{SUIT_SYMBOL[s]}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ============================================================
   UI: StreetTracker (signature rail)
   ============================================================ */
function StreetTracker({ stage }) {
  const steps = ["preflop", "flop", "turn", "river"];
  const idx = steps.indexOf(stage);
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              background: i <= idx ? C.gold : "transparent",
              border: `2px solid ${i <= idx ? C.gold : C.border}`,
              boxShadow: i === idx ? `0 0 0 4px rgba(217,164,65,0.18)` : "none",
            }} />
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 1,
              color: i <= idx ? C.goldBright : C.muted,
            }}>
              {s === "preflop" ? "PREFLOP" : s.toUpperCase()}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < idx ? C.gold : C.border, marginBottom: 18 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ============================================================
   UI: Chip-style selector
   ============================================================ */
function ChipRow({ options, value, onChange, labelFn }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: "8px 14px", borderRadius: 999,
            border: `1.5px solid ${value === opt ? C.gold : C.border}`,
            background: value === opt ? "rgba(217,164,65,0.14)" : "transparent",
            color: value === opt ? C.goldBright : C.text,
            fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13,
            cursor: "pointer",
          }}
        >
          {labelFn ? labelFn(opt) : opt}
        </button>
      ))}
    </div>
  );
}

function NumberField({ label, value, onChange, suffix }) {
  return (
    <div style={{ flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 5, fontFamily: "'Inter', sans-serif" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          style={{ background: "transparent", border: "none", outline: "none", color: C.text, width: "100%", fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600 }}
        />
        {suffix && <span style={{ color: C.muted, fontSize: 12 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>{children}</div>;
}

function AdviceCard({ advice, meta }) {
  if (!advice) return null;
  const color = /fold/i.test(advice.action) ? C.red : /raise|bet|3-bet|4-bet|all-in/i.test(advice.action) ? C.gold : C.teal;
  return (
    <div style={{ background: C.panelAlt, border: `1.5px solid ${color}`, borderRadius: 12, padding: 16, marginTop: 14 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1, color }}>{advice.action}</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: C.text, marginTop: 6, lineHeight: 1.5 }}>{advice.reason}</div>
      {meta && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          {meta.map((m, i) => (
            <div key={i}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Inter', sans-serif", textTransform: "uppercase" }}>{m.label}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: C.goldBright }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */
const emptyHand = (position = "UTG") => ({
  position,
  holeCards: [],
  board: [],
  facing: "none",
  callersBefore: 0,
  pots: { flop: { pot: 0, bet: 0, opp: 1 }, turn: { pot: 0, bet: 0, opp: 1 }, river: { pot: 0, bet: 0, opp: 1 } },
  log: {},
});

function nextPosition(pos) {
  const i = POSITIONS.indexOf(pos);
  return POSITIONS[(i + 1) % POSITIONS.length];
}

export default function PokerLiveAssistant() {
  const [handNumber, setHandNumber] = useState(1);
  const [stage, setStage] = useState("preflop");
  const [hand, setHand] = useState(() => emptyHand("UTG"));
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [table, setTable] = useState({ sb: 1, bb: 2, stack: 200 });
  const [chipDelta, setChipDelta] = useState(0);

  const usedKeys = useMemo(
    () => [...hand.holeCards, ...hand.board].map(cardKey),
    [hand.holeCards, hand.board]
  );

  const preflopAdvice = useMemo(() => {
    if (hand.holeCards.length !== 2) return null;
    const score = chenScore(hand.holeCards[0], hand.holeCards[1]);
    return getPreflopAdvice({ position: hand.position, score, facing: hand.facing, callersBefore: hand.callersBefore });
  }, [hand.holeCards, hand.position, hand.facing, hand.callersBefore]);

  function postflopAdvice(streetKey, neededBoardLen) {
    if (hand.board.length !== neededBoardLen) return null;
    const all = [...hand.holeCards, ...hand.board];
    const evalRes = evaluateHand(all);
    const pairCtx = evalRes.category === 1 ? getPairContext(evalRes.detail.pairRank, hand.holeCards, hand.board) : null;
    let kickerGood = false;
    if (pairCtx && pairCtx.tag === "top") {
      const kicker = hand.holeCards.find((c) => c.r !== evalRes.detail.pairRank);
      kickerGood = kicker && kicker.r >= 11;
    }
    const draws = detectDraws(all, hand.holeCards, hand.board, evalRes.category);
    const cfg = hand.pots[streetKey];
    const advice = getPostflopAdvice({
      category: evalRes.category, pairCtx, kickerGood, draws, board: hand.board,
      potSize: cfg.pot, betToCall: cfg.bet, numOpponents: cfg.opp,
    });
    return { evalRes, pairCtx, draws, advice, cfg };
  }

  const flopResult = stage === "flop" ? postflopAdvice("flop", 3) : null;
  const turnResult = stage === "turn" ? postflopAdvice("turn", 4) : null;
  const riverResult = stage === "river" ? postflopAdvice("river", 5) : null;
  const current = flopResult || turnResult || riverResult;

  function updatePot(streetKey, field, val) {
    setHand((h) => ({ ...h, pots: { ...h.pots, [streetKey]: { ...h.pots[streetKey], [field]: val } } }));
  }

  function goToStreet(next) {
    setStage(next);
  }

  function endHand(resultTag) {
    const stackAfter = table.stack + chipDelta;
    setHistory((h) => [
      {
        handNumber, position: hand.position, holeCards: hand.holeCards, board: hand.board,
        result: resultTag, chipDelta, stackAfter,
      },
      ...h,
    ]);
    setTable((t) => ({ ...t, stack: stackAfter }));
    setChipDelta(0);
    setHandNumber((n) => n + 1);
    setHand(emptyHand(nextPosition(hand.position)));
    setStage("preflop");
  }

  const streetKeyMap = { flop: "flop", turn: "turn", river: "river" };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORT}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 60px" }}>
        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 1.5, color: C.goldBright }}>
            POKER LIVE COACH
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>9-max · Cash</div>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Ván số {handNumber}</div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
          <SectionLabel>Bàn chơi</SectionLabel>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <NumberField label="Blind nhỏ (SB)" value={table.sb} onChange={(v) => setTable((t) => ({ ...t, sb: v }))} />
            <NumberField label="Blind lớn (BB)" value={table.bb} onChange={(v) => setTable((t) => ({ ...t, bb: v }))} />
            <NumberField label="Chip của tôi" value={table.stack} onChange={(v) => setTable((t) => ({ ...t, stack: v }))} />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
            ≈ {table.bb > 0 ? (table.stack / table.bb).toFixed(1) : "—"} bb
          </div>
        </div>

        <StreetTracker stage={stage} />

        {/* ===================== PREFLOP ===================== */}
        {stage === "preflop" && (
          <div>
            <SectionLabel>Vị trí của bạn</SectionLabel>
            <ChipRow options={POSITIONS} value={hand.position} onChange={(v) => setHand((h) => ({ ...h, position: v }))} labelFn={(o) => POSITION_LABEL[o]} />
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
              Tự động xoay sang vị trí kế tiếp sau mỗi ván — bấm chỉnh tay nếu có người vào/rời bàn.
            </div>

            <div style={{ height: 18 }} />
            <SectionLabel>Bài của bạn</SectionLabel>
            <CardPicker need={2} value={hand.holeCards} onChange={(v) => setHand((h) => ({ ...h, holeCards: v }))} disabledKeys={usedKeys} />

            <div style={{ height: 18 }} />
            <SectionLabel>Hành động trước khi tới lượt bạn</SectionLabel>
            <ChipRow
              options={["none", "limped", "open", "3bet", "4bet"]}
              value={hand.facing}
              onChange={(v) => setHand((h) => ({ ...h, facing: v }))}
              labelFn={(o) => FACING_LABEL[o]}
            />

            {hand.facing !== "none" && (
              <div style={{ marginTop: 12 }}>
                <NumberField label="Số người đã vào pot trước bạn" value={hand.callersBefore} onChange={(v) => setHand((h) => ({ ...h, callersBefore: v }))} />
              </div>
            )}

            <AdviceCard
              advice={preflopAdvice}
              meta={preflopAdvice ? [
                { label: "Chen score", value: preflopAdvice.score },
                { label: "Vị trí", value: POSITION_LABEL[hand.position] },
                { label: "Tình huống", value: FACING_LABEL[hand.facing] },
              ] : null}
            />

            {preflopAdvice && (
              <div style={{ marginTop: 16 }}>
                <NumberField label="Kết quả ván này (chip, để 0 nếu chưa biết)" value={chipDelta} onChange={setChipDelta} suffix="chip" />
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button onClick={() => endHand("fold-preflop")} style={btnStyle(C.red, true)}>Fold / Kết thúc ván</button>
                  <button onClick={() => goToStreet("flop")} style={btnStyle(C.teal)}>Tiếp tục → Flop</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== FLOP / TURN / RIVER ===================== */}
        {(stage === "flop" || stage === "turn" || stage === "river") && (
          <div>
            <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 13, color: C.muted }}>
              <span>Vị trí: <b style={{ color: C.text }}>{POSITION_LABEL[hand.position]}</b></span>
              <span>Bài: <b style={{ color: C.text }}>{hand.holeCards.map(cardLabel).join(" ")}</b></span>
            </div>

            <SectionLabel>
              {stage === "flop" ? "Bài chung (3 lá Flop)" : stage === "turn" ? "Thêm 1 lá Turn" : "Thêm 1 lá River"}
            </SectionLabel>
            <CardPicker
              need={stage === "flop" ? 3 : stage === "turn" ? 4 : 5}
              value={hand.board}
              onChange={(v) => setHand((h) => ({ ...h, board: v }))}
              disabledKeys={[...hand.holeCards.map(cardKey)]}
            />

            <div style={{ height: 18 }} />
            <SectionLabel>Tình huống cược</SectionLabel>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <NumberField label="Pot hiện tại" suffix="bb" value={hand.pots[streetKeyMap[stage]].pot} onChange={(v) => updatePot(streetKeyMap[stage], "pot", v)} />
              <NumberField label="Cược cần theo" suffix="bb" value={hand.pots[streetKeyMap[stage]].bet} onChange={(v) => updatePot(streetKeyMap[stage], "bet", v)} />
              <NumberField label="Số đối thủ còn lại" value={hand.pots[streetKeyMap[stage]].opp} onChange={(v) => updatePot(streetKeyMap[stage], "opp", v)} />
            </div>

            {current && (
              <>
                <div style={{ marginTop: 16, fontSize: 13, color: C.muted }}>
                  Bài hiện tại: <b style={{ color: C.goldBright }}>{current.evalRes.label}</b>
                  {current.pairCtx ? ` · ${current.pairCtx.text}` : ""}
                  {current.draws.totalOuts > 0 ? ` · ~${current.draws.totalOuts} outs` : ""}
                </div>
                <AdviceCard
                  advice={current.advice}
                  meta={[
                    ...(current.draws.totalOuts > 0 && stage !== "river" ? [{ label: "Equity ước tính", value: `${current.advice.equityCapped}%` }] : []),
                    ...(current.cfg.bet > 0 ? [{ label: "Pot odds cần", value: `${current.advice.potOddsNeeded.toFixed(1)}%` }] : []),
                  ]}
                />
                <div style={{ marginTop: 16 }}>
                  <NumberField label="Kết quả ván này (chip, để 0 nếu chưa biết)" value={chipDelta} onChange={setChipDelta} suffix="chip" />
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button onClick={() => endHand(`fold-${stage}`)} style={btnStyle(C.red, true)}>Fold / Kết thúc ván</button>
                    {stage !== "river" && (
                      <button onClick={() => goToStreet(stage === "flop" ? "turn" : "river")} style={btnStyle(C.teal)}>
                        Tiếp tục → {stage === "flop" ? "Turn" : "River"}
                      </button>
                    )}
                    {stage === "river" && (
                      <button onClick={() => endHand("showdown")} style={btnStyle(C.gold)}>Kết thúc ván</button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===================== HISTORY ===================== */}
        {history.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <button
              onClick={() => setShowHistory((s) => !s)}
              style={{ background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" }}
            >
              {showHistory ? "Ẩn" : "Xem"} lịch sử phiên ({history.length} ván)
            </button>
            {showHistory && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {history.map((h, i) => (
                  <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.muted }}>#{h.handNumber} · {POSITION_LABEL[h.position]}</span>
                      <span>{h.holeCards.map(cardLabel).join(" ")} {h.board.length > 0 ? "· " + h.board.map(cardLabel).join(" ") : ""}</span>
                      <span style={{ color: C.gold }}>{h.result}</span>
                    </div>
                    {h.chipDelta !== 0 && (
                      <div style={{ marginTop: 2, fontSize: 12, color: h.chipDelta > 0 ? C.teal : C.red }}>
                        {h.chipDelta > 0 ? "+" : ""}{h.chipDelta} chip · stack còn {h.stackAfter}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 28, fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
          Công cụ dùng công thức Chen (preflop) và pot odds / outs (postflop) để ước lượng nhanh, mang tính tham khảo,
          không thay thế hoàn toàn cho đọc bài và kinh nghiệm thực tế tại bàn.
        </div>
      </div>
    </div>
  );
}

function btnStyle(color, outline) {
  return {
    flex: 1, padding: "12px 0", borderRadius: 10,
    border: `1.5px solid ${color}`,
    background: outline ? "transparent" : color,
    color: outline ? color : "#10180f",
    fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 14,
    cursor: "pointer",
  };
}
