// Day Pay v1.1
import React, { useState, useEffect, useRef } from "react";

// ─── Currencies ───────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code:"GBP", symbol:"£",  name:"British Pound" },
  { code:"USD", symbol:"$",  name:"US Dollar" },
  { code:"EUR", symbol:"€",  name:"Euro" },
  { code:"JPY", symbol:"¥",  name:"Japanese Yen" },
  { code:"CAD", symbol:"$",  name:"Canadian Dollar" },
  { code:"AUD", symbol:"$",  name:"Australian Dollar" },
  { code:"CHF", symbol:"Fr", name:"Swiss Franc" },
  { code:"INR", symbol:"₹",  name:"Indian Rupee" },
  { code:"BRL", symbol:"R$", name:"Brazilian Real" },
  { code:"MXN", symbol:"$",  name:"Mexican Peso" },
  { code:"ZAR", symbol:"R",  name:"South African Rand" },
  { code:"SEK", symbol:"kr", name:"Swedish Krona" },
];

// ─── Pay Schedule ─────────────────────────────────────────────────────────────
const FREQUENCIES  = [
  { id:"weekly",    label:"Every week" },
  { id:"fortnightly",label:"Every 2 weeks" },
  { id:"monthly",   label:"Every month" },
  { id:"custom",    label:"Custom date" },
];
const WEEK_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const WEEK_DAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── Date Helpers ─────────────────────────────────────────────────────────────
function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function todayISO() { return toISO(new Date()); }
function parseISO(iso) { return new Date(iso+"T00:00:00"); }
function addDaysISO(iso, n) { const d = parseISO(iso); d.setDate(d.getDate()+n); return toISO(d); }

function getLastWorkingDay(year, month) {
  let d = new Date(year, month + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

// payConfig = { frequency, weekDay (0=Mon..6=Sun), monthDay (1-31 or "last_working"), customDate, anchorDate }
// refDate (optional): calculate "next payday" as if today were refDate — used when catching up missed days
function getNextPayday(schedule, customDate, payConfig, refDate) {
  const today = refDate ? new Date(refDate) : new Date(); today.setHours(0,0,0,0);

  // Legacy support for old schedule strings
  if (!payConfig) {
    if (schedule === "every_friday")     payConfig = { frequency:"weekly", weekDay:4 };
    else if (schedule === "every_2_weeks") payConfig = { frequency:"fortnightly", weekDay:4, anchorDate:customDate };
    else if (schedule === "last_working_day") payConfig = { frequency:"monthly", monthDay:"last_working" };
    else if (schedule === "custom" && customDate) payConfig = { frequency:"custom", customDate };
    else payConfig = { frequency:"monthly", monthDay:"last_working" };
  }

  const { frequency, weekDay=4, monthDay=1, anchorDate } = payConfig;

  if (frequency === "weekly") {
    // weekDay: 0=Mon..6=Sun, JS: 0=Sun..6=Sat
    const jsDay = (weekDay + 1) % 7; // convert Mon=0 to JS Sun=0
    let d = new Date(today);
    const curr = d.getDay();
    let diff = (jsDay - curr + 7) % 7;
    if (diff === 0) diff = 7; // already today, go next week
    d.setDate(d.getDate() + diff);
    return toISO(d);
  }

  if (frequency === "fortnightly") {
    if (anchorDate) {
      let anchor = new Date(anchorDate+"T00:00:00");
      while (anchor <= today) anchor.setDate(anchor.getDate() + 14);
      return toISO(anchor);
    }
    // No anchor — use weekDay, find next occurrence + 7
    const jsDay = (weekDay + 1) % 7;
    let d = new Date(today);
    const curr = d.getDay();
    let diff = (jsDay - curr + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff + 7);
    return toISO(d);
  }

  if (frequency === "monthly") {
    if (monthDay === "last_working") {
      let payday = getLastWorkingDay(today.getFullYear(), today.getMonth());
      if (today >= payday) payday = getLastWorkingDay(
        today.getMonth()===11 ? today.getFullYear()+1 : today.getFullYear(),
        today.getMonth()===11 ? 0 : today.getMonth()+1
      );
      return toISO(payday);
    }
    // Specific day of month
    const day = parseInt(monthDay)||1;
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d <= today) d = new Date(today.getFullYear(), today.getMonth()+1, day);
    return toISO(d);
  }

  if (frequency === "custom" && payConfig.customDate) {
    let d = new Date(payConfig.customDate+"T00:00:00");
    if (d <= today) d.setMonth(d.getMonth()+1);
    return toISO(d);
  }

  let d = new Date(today); d.setDate(d.getDate() + 30);
  return toISO(d);
}

// Days from today UNTIL payday, NOT including payday itself
// e.g. if payday is in 5 days, we get 5 spending days (today + 4 more)
function daysUntilPayday(paydayISO, fromISO) {
  const today = fromISO ? parseISO(fromISO) : new Date(); today.setHours(0,0,0,0);
  const payday = new Date(paydayISO+"T00:00:00"); payday.setHours(0,0,0,0);
  const diff = Math.ceil((payday - today) / 86400000);
  return Math.max(diff, 1); // days of spending = days before payday
}

// ─── Bill reservation helpers ─────────────────────────────────────────────────
// Single source of truth for "is this bill due on this date?"
function billDueOn(bill, date) {
  if(bill.frequency==="daily")  return true;
  if(bill.frequency==="weekly"){
    // dayOfWeek: 0=Mon..6=Sun (same as pay schedule). Older bills without one default to Friday.
    const dow = bill.dayOfWeek ?? 4;
    return date.getDay() === (dow + 1) % 7;
  }
  if(bill.frequency==="monthly"){
    // Clamp e.g. the 31st to the last day of shorter months so it never gets skipped
    const lastDay = new Date(date.getFullYear(), date.getMonth()+1, 0).getDate();
    return date.getDate() === Math.min(parseInt(bill.dayOfMonth)||1, lastDay);
  }
  return false;
}

// Bills that will hit AFTER today and BEFORE payday.
// Today's bills were already deducted at day close; bills due on payday come out of the new pay.
function getUpcomingBills(bills, paydayISO, fromISO) {
  const out = [];
  const d = fromISO ? parseISO(fromISO) : new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+1);
  const payday = new Date(paydayISO+"T00:00:00");
  for(let guard=0; d<payday && guard<400; guard++){
    for(const b of bills){
      if((b.accountId||"main")==="main" && billDueOn(b,d)) out.push({ bill:b, date:toISO(d) });
    }
    d.setDate(d.getDate()+1);
  }
  return out;
}

function reservedForBills(bills, paydayISO, fromISO) {
  return getUpcomingBills(bills ?? [], paydayISO, fromISO)
    .filter(x => (x.bill.deductMode ?? "reserve") === "reserve")
    .reduce((t,x)=>t+x.bill.amount, 0);
}

// Daily budget = (balance − money committed to bills before payday) ÷ spending days
function calcDailyBudget(balance, bills, paydayISO, fromISO) {
  const days = daysUntilPayday(paydayISO, fromISO);
  const available = Math.max(0, balance - reservedForBills(bills, paydayISO, fromISO));
  return parseFloat((days>0 ? available/days : available).toFixed(2));
}

// How a day's entries affect budget and balance
//  regular : normal spending — counts against the day AND leaves the balance at day close
//  payoff  : card payments from main — counts against the day, balance already reduced when logged
//  income  : income into main — balance already increased when logged
function summariseEntries(entries) {
  const sum = (f) => (entries ?? []).filter(f).reduce((t,e)=>t+e.amount, 0);
  const regular = sum(e=>!e.isCreditCard&&!e.isIncome&&!e.isBillDeduction&&!e.isAutoBalancer);
  const payoff  = sum(e=>e.isAutoBalancer);
  const income  = sum(e=>e.isIncome&&(e.destination??"main")==="main");
  return { regular, payoff, income, spent: regular + payoff };
}

function isToday(iso) {
  return iso === todayISO();
}
function isTodayPayday(paydayISO) {
  return paydayISO === todayISO();
}

function shortDate(dateStr) {
  return new Date(dateStr+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
}
function longDate(dateStr) {
  return new Date(dateStr+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
}
function monthLabel(dateStr) {
  return new Date(dateStr+"T00:00:00").toLocaleDateString("en-GB",{month:"long",year:"numeric"});
}

// ─── localStorage ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "daypay_v3";
function loadAll() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveAll(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) { console.warn(e); }
}

// ─── Trophies ─────────────────────────────────────────────────────────────────



// ─── NumPad ───────────────────────────────────────────────────────────────────
function NumPad({ onKey }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
      {["7","8","9","4","5","6","1","2","3",".","0","⌫"].map(k=>(
        <button key={k} onClick={()=>onKey(k)} style={{
          padding:"18px 0",borderRadius:"16px",border:"none",
          background:k==="⌫"?"rgba(248,113,113,0.1)":"rgba(255,255,255,0.06)",
          color:k==="⌫"?"#F87171":"rgba(255,255,255,0.85)",
          fontSize:"22px",fontWeight:"600",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"
        }}>{k}</button>
      ))}
    </div>
  );
}

// ─── Day Summary Modal ────────────────────────────────────────────────────────
function DaySummaryModal({ summary, sym, onClose }) {
  if (!summary) return null;
  const saved = summary.budget - summary.spent;
  const isUnder = saved >= 0;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,6,18,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250,backdropFilter:"blur(10px)",padding:"24px"}}>
      <div style={{
        background:"linear-gradient(145deg,#111827,#0d1117)",
        border:`1px solid ${isUnder?"rgba(52,211,153,0.3)":"rgba(248,113,113,0.3)"}`,
        borderRadius:"28px",padding:"32px 28px",width:"100%",maxWidth:"360px",
        animation:"popIn 0.38s cubic-bezier(0.34,1.56,0.64,1)",textAlign:"center"
      }}>
        <div style={{fontSize:"52px",marginBottom:"12px"}}>{isUnder?"🌟":"📊"}</div>
        <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"3px",textTransform:"uppercase",marginBottom:"6px"}}>
          Yesterday · {shortDate(summary.date)}
        </div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"28px",fontWeight:"700",color:"#fff",marginBottom:"20px"}}>
          {isUnder?"Under Budget!":"Over Budget"}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"20px"}}>
          {[
            {label:"Budget",  value:`${sym}${summary.budget.toFixed(2)}`, color:"rgba(255,255,255,0.6)"},
            {label:"Spent",   value:`${sym}${summary.spent.toFixed(2)}`,  color:isUnder?"#fff":"#F87171"},
            {label:isUnder?"Saved":"Over", value:`${sym}${Math.abs(saved).toFixed(2)}`, color:isUnder?"#34D399":"#F87171"},
          ].map(item=>(
            <div key={item.label} style={{background:"rgba(255,255,255,0.04)",borderRadius:"14px",padding:"12px 8px"}}>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"4px"}}>{item.label}</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"18px",fontWeight:"700",color:item.color}}>{item.value}</div>
            </div>
          ))}
        </div>
        {summary.awayDays>0 && (
          <div style={{background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:"14px",padding:"12px",marginBottom:"16px",fontSize:"12px",color:"rgba(255,255,255,0.6)",lineHeight:1.6,textAlign:"left"}}>
            👋 Welcome back! We caught up {summary.awayDays+1} days while you were away — bills and payday included. Forgot to log something? Tap any day in <strong style={{color:"#fff"}}>History</strong> to add it.
          </div>
        )}
        {summary.expenses?.length>0 && (
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"14px",padding:"12px",marginBottom:"20px",textAlign:"left"}}>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>What you spent on</div>
            {summary.expenses.map((e,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:i<summary.expenses.length-1?"1px solid rgba(255,255,255,0.04)":"none"}}>
                <span style={{fontSize:"13px",color:"rgba(255,255,255,0.6)"}}>{e.label}</span>
                <span style={{fontSize:"13px",color:"#fff",fontWeight:"600"}}>{sym}{e.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{
          width:"100%",padding:"14px",
          background:isUnder?"linear-gradient(135deg,#34D399,#059669)":"rgba(255,255,255,0.08)",
          border:"none",borderRadius:"16px",color:isUnder?"#061a0e":"#fff",
          fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"15px",cursor:"pointer"
        }}>Start Today</button>
      </div>
    </div>
  );
}

// ─── Payday Modal (confirm new balance) ──────────────────────────────────────
function PaydayModal({ sym, suggestedBalance, onConfirm }) {
  const [input, setInput] = useState(String(Math.round(suggestedBalance)));
  const num = parseFloat(input) || 0;

  const handleKey = (key) => {
    if (key==="⌫") { setInput(p=>p.length>1?p.slice(0,-1):"0"); return; }
    if (key==="." && input.includes(".")) return;
    if (input==="0" && key!==".") { setInput(key); return; }
    if (input.length>=10) return;
    setInput(p=>p+key);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,6,18,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:260,backdropFilter:"blur(10px)",padding:"24px"}}>
      <div style={{
        background:"linear-gradient(145deg,#111827,#0d1117)",
        border:"1px solid rgba(52,211,153,0.35)",
        borderRadius:"28px",padding:"32px 28px",width:"100%",maxWidth:"360px",
        animation:"popIn 0.38s cubic-bezier(0.34,1.56,0.64,1)",textAlign:"center"
      }}>
        <div style={{fontSize:"52px",marginBottom:"12px"}}>💰</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"28px",fontWeight:"700",color:"#fff",marginBottom:"8px"}}>
          Payday! 🎉
        </div>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.45)",lineHeight:1.65,marginBottom:"8px"}}>
          We've added your income. Your estimated balance is below — adjust if it doesn't look right.
        </div>
        <div style={{fontSize:"12px",color:"rgba(52,211,153,0.7)",marginBottom:"20px"}}>
          {sym}{suggestedBalance.toFixed(2)} estimated
        </div>

        <div style={{background:"rgba(0,0,0,0.3)",borderRadius:"16px",padding:"16px 20px",marginBottom:"14px",textAlign:"right"}}>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px",textAlign:"left"}}>Current Balance</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"42px",fontWeight:"700",color:"#34D399"}}>
            {sym}{input}
          </div>
        </div>

        <div style={{marginBottom:"16px"}}><NumPad onKey={handleKey}/></div>

        <button onClick={()=>{if(num>0)onConfirm(num);}} disabled={num<=0} style={{
          width:"100%",padding:"16px",
          background:num>0?"linear-gradient(135deg,#34D399,#059669)":"rgba(255,255,255,0.05)",
          border:"none",borderRadius:"16px",
          color:num>0?"#061a0e":"rgba(255,255,255,0.2)",
          fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",
          cursor:num>0?"pointer":"default",
          boxShadow:num>0?"0 6px 24px rgba(52,211,153,0.28)":"none"
        }}>
          Confirm & Start New Period
        </button>
      </div>
    </div>
  );
}



// ─── Pay Schedule Builder ─────────────────────────────────────────────────────
function PayScheduleBuilder({ payConfig, onChange, sym }) {
  const cfg = payConfig || { frequency:"monthly", monthDay:"last_working" };
  const { frequency="monthly", weekDay=4, monthDay="last_working", anchorDate, customDate } = cfg;

  const set = (patch) => onChange({ ...cfg, ...patch });

  const nextPayday = getNextPayday(null, null, cfg);
  const days = daysUntilPayday(nextPayday);

  return (
    <div>
      {/* Frequency */}
      <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>How often?</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"14px"}}>
        {FREQUENCIES.map(f=>(
          <button key={f.id} onClick={()=>set({frequency:f.id})} style={{
            padding:"12px",borderRadius:"12px",border:"none",textAlign:"center",
            background:frequency===f.id?"rgba(52,211,153,0.15)":"rgba(255,255,255,0.04)",
            border:`1px solid ${frequency===f.id?"rgba(52,211,153,0.4)":"rgba(255,255,255,0.07)"}`,
            color:frequency===f.id?"#34D399":"rgba(255,255,255,0.45)",
            fontFamily:"'DM Sans',sans-serif",fontSize:"13px",fontWeight:"600",cursor:"pointer"
          }}>{f.label}</button>
        ))}
      </div>

      {/* Weekly or Fortnightly — pick day of week */}
      {(frequency==="weekly"||frequency==="fortnightly")&&(
        <>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>Which day?</div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"14px"}}>
            {WEEK_DAYS.map((d,i)=>(
              <button key={i} onClick={()=>set({weekDay:i,anchorDate:null})} style={{
                padding:"8px 10px",borderRadius:"10px",border:"none",
                background:weekDay===i?"rgba(52,211,153,0.15)":"rgba(255,255,255,0.04)",
                border:`1px solid ${weekDay===i?"rgba(52,211,153,0.4)":"rgba(255,255,255,0.07)"}`,
                color:weekDay===i?"#34D399":"rgba(255,255,255,0.45)",
                fontFamily:"'DM Sans',sans-serif",fontSize:"12px",fontWeight:"600",cursor:"pointer"
              }}>{WEEK_DAY_SHORT[i]}</button>
            ))}
          </div>
          {frequency==="fortnightly"&&(
            <div style={{marginBottom:"14px"}}>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>When was your last payday? (sets the cycle)</div>
              <input type="date" value={anchorDate||""} onChange={e=>set({anchorDate:e.target.value})}
                style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"12px",padding:"12px 14px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none",colorScheme:"dark",boxSizing:"border-box"}}/>
            </div>
          )}
        </>
      )}

      {/* Monthly — pick day of month */}
      {frequency==="monthly"&&(
        <>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>Which day of the month?</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"14px"}}>
            <button onClick={()=>set({monthDay:"last_working"})} style={{
              padding:"12px",borderRadius:"12px",border:"none",textAlign:"center",
              background:monthDay==="last_working"?"rgba(52,211,153,0.15)":"rgba(255,255,255,0.04)",
              border:`1px solid ${monthDay==="last_working"?"rgba(52,211,153,0.4)":"rgba(255,255,255,0.07)"}`,
              color:monthDay==="last_working"?"#34D399":"rgba(255,255,255,0.45)",
              fontFamily:"'DM Sans',sans-serif",fontSize:"13px",fontWeight:"600",cursor:"pointer"
            }}>Last working day</button>
            <button onClick={()=>set({monthDay:monthDay==="last_working"?25:monthDay})} style={{
              padding:"12px",borderRadius:"12px",border:"none",textAlign:"center",
              background:monthDay!=="last_working"?"rgba(52,211,153,0.15)":"rgba(255,255,255,0.04)",
              border:`1px solid ${monthDay!=="last_working"?"rgba(52,211,153,0.4)":"rgba(255,255,255,0.07)"}`,
              color:monthDay!=="last_working"?"#34D399":"rgba(255,255,255,0.45)",
              fontFamily:"'DM Sans',sans-serif",fontSize:"13px",fontWeight:"600",cursor:"pointer"
            }}>Specific date</button>
          </div>
          {monthDay!=="last_working"&&(
            <>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"8px"}}>Day of month</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"14px"}}>
                {Array.from({length:31},(_,i)=>i+1).map(d=>(
                  <button key={d} onClick={()=>set({monthDay:d})} style={{
                    width:"36px",height:"36px",borderRadius:"8px",border:"none",
                    background:monthDay===d?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.05)",
                    border:`1px solid ${monthDay===d?"rgba(52,211,153,0.5)":"rgba(255,255,255,0.07)"}`,
                    color:monthDay===d?"#34D399":"rgba(255,255,255,0.4)",
                    fontFamily:"'DM Sans',sans-serif",fontSize:"12px",fontWeight:"600",cursor:"pointer"
                  }}>{d}</button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Custom date */}
      {frequency==="custom"&&(
        <div style={{marginBottom:"14px"}}>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>Next payday date</div>
          <input type="date" value={customDate||""} onChange={e=>set({customDate:e.target.value})}
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"12px",padding:"12px 14px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none",colorScheme:"dark",boxSizing:"border-box"}}/>
        </div>
      )}

      {/* Preview */}
      <div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.15)",borderRadius:"12px",padding:"12px 14px"}}>
        <div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"3px"}}>Next payday</div>
        <div style={{fontSize:"14px",color:"#34D399",fontWeight:"600"}}>{longDate(nextPayday)}</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{days} days away</div>
      </div>
    </div>
  );
}


// ─── Credit Card Sheet ────────────────────────────────────────────────────────
function CreditCardSheet({ open, onClose, creditCards, onAdd, onDelete, onUpdate, sym }) {
  const [translateY, setTranslateY] = React.useState(0);
  const startY = React.useRef(null);
  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e) => { const dy = e.touches[0].clientY - startY.current; if(dy>0) setTranslateY(dy); };
  const handleTouchEnd   = () => { if(translateY>80){setTranslateY(0);onClose();}else setTranslateY(0); };

  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");

  if(!open) return null;

  const handleAdd = () => {
    if(!name.trim()) return;
    onAdd({ id:`card_${Date.now()}`, name:name.trim(), balance:parseFloat(balance)||0, type:"credit" });
    setName(""); setBalance("");
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div
        style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",maxHeight:"88vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)",transform:`translateY(${translateY}px)`,transition:translateY===0?"transform 0.3s ease":"none"}}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      >
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px",cursor:"grab"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.3)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff",marginBottom:"6px"}}>Credit Cards</div>
          <div style={{fontSize:"13px",color:"rgba(255,255,255,0.35)",marginBottom:"20px"}}>Track what you owe. Card spending won't affect your daily budget.</div>

          {/* Add card */}
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"18px",padding:"16px",marginBottom:"20px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>Add Card</div>
            <input placeholder="Card name (e.g. Amex, Barclaycard)" value={name} onChange={e=>setName(e.target.value)}
              style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"12px",padding:"12px 14px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none",marginBottom:"10px",boxSizing:"border-box"}}/>
            <div style={{position:"relative",marginBottom:"10px"}}>
              <span style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.3)",fontSize:"15px"}}>{sym}</span>
              <input type="number" placeholder="Balance owed" value={balance} onChange={e=>setBalance(e.target.value)}
                style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"12px",padding:"12px 12px 12px 28px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none",boxSizing:"border-box"}}/>
            </div>
            <button onClick={handleAdd} disabled={!name.trim()} style={{
              width:"100%",padding:"13px",
              background:name.trim()?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.04)",
              border:name.trim()?"1px solid rgba(167,139,250,0.3)":"1px solid rgba(255,255,255,0.07)",
              borderRadius:"12px",color:name.trim()?"#A78BFA":"rgba(255,255,255,0.2)",
              fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"14px",cursor:"pointer"
            }}>+ Add Card</button>
          </div>

          {/* Card list */}
          {creditCards.length===0 ? (
            <div style={{textAlign:"center",padding:"24px 0",color:"rgba(255,255,255,0.25)",fontSize:"13px"}}>No cards added yet</div>
          ) : creditCards.map(card=>(
            <div key={card.id} style={{background:"rgba(248,113,113,0.05)",border:"1px solid rgba(248,113,113,0.15)",borderRadius:"16px",padding:"14px 16px",marginBottom:"10px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <span style={{fontSize:"22px"}}>💳</span>
                  <div>
                    <div style={{fontWeight:"600",fontSize:"14px",color:"#fff"}}>{card.name}</div>
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"1px"}}>Credit Card</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"18px",fontWeight:"700",color:"#F87171",fontFamily:"'Cormorant Garamond',serif"}}>Owed {sym}{card.balance.toFixed(2)}</div>
                  <button onClick={()=>onDelete(card.id)} style={{background:"rgba(248,113,113,0.1)",border:"none",borderRadius:"8px",padding:"4px 10px",color:"#F87171",fontFamily:"'DM Sans',sans-serif",fontSize:"11px",cursor:"pointer",fontWeight:"600",marginTop:"6px"}}>Remove</button>
                </div>
              </div>
              <div style={{marginTop:"10px",paddingTop:"10px",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",gap:"8px",alignItems:"center"}}>
                <input type="number" placeholder="Update balance owed" onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v))onUpdate(card.id,v);e.target.value="";}}
                  style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",padding:"8px 12px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"13px",outline:"none"}}/>
                <span style={{fontSize:"12px",color:"rgba(255,255,255,0.3)"}}>Update</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─── Update Balance Sheet (Calculator Mode) ───────────────────────────────────
function UpdateBalanceSheet({ open, onClose, sym, currentBalance, onUpdate }) {
  const [display, setDisplay] = useState(currentBalance.toFixed(2));

  React.useEffect(()=>{
    if(open) setDisplay(currentBalance.toFixed(2));
  },[open]);

  if(!open) return null;

  const handleKey = (k) => {
    if(k==="⌫") setDisplay(p=>p.length>1?p.slice(0,-1):"0");
    else if(k==="."&&display.includes(".")) return;
    else if(display==="0"&&k!==".") setDisplay(k);
    else if(display.length<10) setDisplay(p=>p+k);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.3)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"22px",fontWeight:"700",color:"#fff",marginBottom:"16px"}}>Update Balance</div>
          <div style={{background:"rgba(0,0,0,0.3)",borderRadius:"14px",padding:"14px 18px",marginBottom:"12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"38px",fontWeight:"700",color:"#fff",lineHeight:1}}>{sym}{display}</div>
            <button onClick={onClose} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:"20px",cursor:"pointer"}}>×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px",marginBottom:"10px"}}>
            {["7","8","9","4","5","6","1","2","3",".","0","⌫"].map(k=>(
              <button key={k} onClick={()=>handleKey(k)} style={{padding:"16px 0",borderRadius:"12px",border:"none",background:k==="⌫"?"rgba(248,113,113,0.1)":"rgba(255,255,255,0.06)",color:k==="⌫"?"#F87171":"rgba(255,255,255,0.85)",fontSize:"20px",fontWeight:"600",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"}}>{k}</button>
            ))}
          </div>
          <button onClick={()=>{const v=parseFloat(display);if(v>0){onUpdate(v);onClose();}}} style={{width:"100%",padding:"15px",background:"rgba(52,211,153,0.15)",border:"1px solid rgba(52,211,153,0.3)",borderRadius:"14px",color:"#34D399",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",cursor:"pointer"}}>
            Update to {sym}{display}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recurring Bills Sheet ────────────────────────────────────────────────────
const BILL_FREQUENCIES = [
  { id:"daily",   label:"Daily" },
  { id:"weekly",  label:"Weekly" },
  { id:"monthly", label:"Monthly" },
];

function RecurringSheet({ open, onClose, bills, onAdd, onDelete, sym, accounts }) {
  const [translateY, setTranslateY] = React.useState(0);
  const startY = React.useRef(null);
  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e) => { const dy = e.touches[0].clientY - startY.current; if(dy>0) setTranslateY(dy); };
  const handleTouchEnd   = () => { if(translateY>80){setTranslateY(0);onClose();}else setTranslateY(0); };

  const [name,       setName]       = useState("");
  const [amount,     setAmount]     = useState("");
  const [freq,       setFreq]       = useState("monthly");
  const [day,        setDay]        = useState("1");
  const [billAccId,  setBillAccId]  = useState("main");
  const [weekDay,    setWeekDay]    = useState("4"); // 0=Mon..6=Sun, default Friday
  const [deductMode, setDeductMode] = useState("reserve"); // "reserve" or "day-of

  const [tab, setTab] = React.useState("spending");
  if (!open) return null;

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (!name.trim() || !amt || amt <= 0) return;
    onAdd({ id: `bill_${Date.now()}`, name: name.trim(), amount: amt, frequency: freq, dayOfMonth: parseInt(day)||1, dayOfWeek: parseInt(weekDay), accountId: billAccId, deductMode });
    setName(""); setAmount(""); setFreq("monthly"); setDay("1"); setWeekDay("4"); setBillAccId("main"); setDeductMode("reserve");
  };

  const monthlyTotal = bills.reduce((s,b) => {
    if(b.frequency==="daily")   return s + b.amount * 30;
    if(b.frequency==="weekly")  return s + b.amount * 4.33;
    return s + b.amount;
  }, 0);

  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div
        style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",maxHeight:"88vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)",transform:`translateY(${translateY}px)`,transition:translateY===0?"transform 0.3s ease":"none"}}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      >
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px",cursor:"grab"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.3)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff"}}>Recurring Bills</div>
            {monthlyTotal>0&&<div style={{fontSize:"12px",color:"#F87171"}}>{sym}{monthlyTotal.toFixed(2)}/mo</div>}
          </div>
          <div style={{background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:"14px",padding:"12px 14px",marginBottom:"20px",display:"flex",gap:"10px",alignItems:"flex-start"}}>
            <span style={{fontSize:"16px",flexShrink:0}}>💡</span>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",lineHeight:1.65}}>
              Bills can be set to <span style={{color:"#FBBF24",fontWeight:"600"}}>Reserve daily</span> (budget drops now, due date free) or <span style={{color:"#F87171",fontWeight:"600"}}>Deduct on the day</span> (budget unchanged, full amount hits on due date). You choose when adding each bill.
            </div>
          </div>

          {/* Add new bill */}
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"18px",padding:"16px",marginBottom:"20px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>Add Bill</div>
            <input placeholder="Bill name (e.g. Netflix)" value={name} onChange={e=>setName(e.target.value)}
              style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"12px",padding:"12px 14px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none",marginBottom:"10px",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
              <div style={{position:"relative",flex:1}}>
                <span style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.3)",fontSize:"15px"}}>{sym}</span>
                <input type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}
                  style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"12px",padding:"12px 12px 12px 28px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <select value={freq} onChange={e=>setFreq(e.target.value)}
                style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"12px",padding:"12px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"13px",outline:"none",colorScheme:"dark"}}>
                {BILL_FREQUENCIES.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            {freq==="monthly"&&(
              <div style={{marginBottom:"10px"}}>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"6px"}}>Day of month</div>
                <input type="number" min="1" max="31" value={day} onChange={e=>setDay(e.target.value)}
                  style={{width:"80px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"10px",padding:"10px 12px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none"}}/>
              </div>
            )}
            {freq==="weekly"&&(
              <div style={{marginBottom:"10px"}}>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"6px"}}>Day of week</div>
                <div style={{display:"flex",gap:"4px"}}>
                  {WEEK_DAY_SHORT.map((d,i)=>(
                    <button key={d} onClick={()=>setWeekDay(String(i))} style={{
                      flex:1,padding:"9px 0",borderRadius:"10px",cursor:"pointer",
                      background:weekDay===String(i)?"rgba(248,113,113,0.15)":"rgba(255,255,255,0.04)",
                      border:weekDay===String(i)?"1px solid rgba(248,113,113,0.35)":"1px solid rgba(255,255,255,0.07)",
                      color:weekDay===String(i)?"#F87171":"rgba(255,255,255,0.45)",
                      fontFamily:"'DM Sans',sans-serif",fontSize:"12px",fontWeight:"600"
                    }}>{d}</button>
                  ))}
                </div>
              </div>
            )}
            {/* Account selector */}

            {/* Deduction mode toggle */}
            <div style={{marginBottom:"10px"}}>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"8px"}}>How should this bill affect your budget?</div>
              <div style={{display:"flex",gap:"6px",background:"rgba(0,0,0,0.2)",borderRadius:"12px",padding:"4px"}}>
                <button onClick={()=>setDeductMode("reserve")} style={{
                  flex:1,padding:"9px",borderRadius:"8px",border:"none",cursor:"pointer",
                  background:deductMode==="reserve"?"rgba(251,191,36,0.15)":"transparent",
                  color:deductMode==="reserve"?"#FBBF24":"rgba(255,255,255,0.35)",
                  fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"12px"
                }}>🔒 Reserve daily</button>
                <button onClick={()=>setDeductMode("day-of")} style={{
                  flex:1,padding:"9px",borderRadius:"8px",border:"none",cursor:"pointer",
                  background:deductMode==="day-of"?"rgba(248,113,113,0.15)":"transparent",
                  color:deductMode==="day-of"?"#F87171":"rgba(255,255,255,0.35)",
                  fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"12px"
                }}>📅 Deduct on the day</button>
              </div>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginTop:"6px",lineHeight:1.7}}>
                {deductMode==="reserve"
                  ? "The cost is spread across your daily budget from today until the bill is due — so your spending money is slightly lower each day rather than taking a big hit all at once. On the due date the money leaves your balance but won't count against that day's spending since it was already set aside."
                  : "Your daily budget stays exactly the same until the due date. On that day the full amount deducts from your balance and appears as an expense — just like logging it manually. Good if you prefer to see exactly what leaves your account and when."}
              </div>
            </div>

            <button onClick={handleAdd} disabled={!name.trim()||!parseFloat(amount)} style={{
              width:"100%",padding:"13px",
              background:name.trim()&&parseFloat(amount)?"rgba(248,113,113,0.15)":"rgba(255,255,255,0.04)",
              border:name.trim()&&parseFloat(amount)?"1px solid rgba(248,113,113,0.3)":"1px solid rgba(255,255,255,0.07)",
              borderRadius:"12px",color:name.trim()&&parseFloat(amount)?"#F87171":"rgba(255,255,255,0.2)",
              fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"14px",cursor:"pointer"
            }}>+ Add Bill</button>
          </div>

          {/* Bill list */}
          {bills.length===0 ? (
            <div style={{textAlign:"center",padding:"24px 0",color:"rgba(255,255,255,0.25)",fontSize:"13px"}}>No recurring bills yet</div>
          ) : bills.map(b=>(
            <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <div>
                <div style={{fontWeight:"600",fontSize:"14px",color:"#fff"}}>{b.name}</div>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>
                  {sym}{b.amount.toFixed(2)} · {b.frequency}{b.frequency==="monthly"?` (day ${b.dayOfMonth})`:b.frequency==="weekly"?` (${WEEK_DAYS[b.dayOfWeek ?? 4]}s)`:""} · {(b.deductMode??"reserve")==="reserve"?"🔒 Reserved":"📅 Day of"}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                <div style={{fontSize:"13px",color:"#F87171",fontWeight:"600"}}>{sym}{b.amount.toFixed(2)}</div>
                <button onClick={()=>onDelete(b.id)} style={{background:"rgba(248,113,113,0.12)",border:"none",borderRadius:"8px",width:"28px",height:"28px",color:"#F87171",cursor:"pointer",fontSize:"15px",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── History Sheet ────────────────────────────────────────────────────────────
// ─── Edit a past day ──────────────────────────────────────────────────────────
function DayEditSheet({ day, sym, onClose, onSave }) {
  const [entries, setEntries] = useState(day?.expenses ?? []);
  const [amount,  setAmount]  = useState("");
  const [label,   setLabel]   = useState("");
  const [kind,    setKind]    = useState("expense");
  if(!day) return null;

  // Only plain expenses and income to main can be edited — bills and card payments are read-only
  const editable = e => !e.isBillDeduction && !e.isAutoBalancer && !e.isCreditCard && !e.isCreditPayoff
                        && (!e.isIncome || (e.destination??"main")==="main");
  const add = () => {
    const amt = parseFloat(amount);
    if(!amt || amt<=0) return;
    const base = { id:`edit_${Date.now()}`, amount:amt, label:label.trim() || (kind==="income"?"Income":"Expense"), addedLater:true };
    setEntries(prev=>[...prev, kind==="income" ? {...base, isIncome:true, destination:"main"} : base]);
    setAmount(""); setLabel("");
  };
  const { spent } = summariseEntries(entries);
  const under = spent < day.budget;
  const field = {background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"12px",padding:"12px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none",boxSizing:"border-box"};

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"20px 24px 48px",maxHeight:"88vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff"}}>{longDate(day.date)}</div>
        <div style={{fontSize:"13px",color:under?"#34D399":"#F87171",margin:"4px 0 16px"}}>
          {sym}{spent.toFixed(2)} of {sym}{day.budget.toFixed(2)} · {under?`under by ${sym}${(day.budget-spent).toFixed(2)}`:`over by ${sym}${(spent-day.budget).toFixed(2)}`}
        </div>

        {entries.length===0 && <div style={{textAlign:"center",padding:"16px 0",color:"rgba(255,255,255,0.25)",fontSize:"13px"}}>Nothing logged for this day</div>}
        {entries.map(e=>(
          <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{fontSize:"14px",color:"rgba(255,255,255,0.75)"}}>
              {e.label}{e.isBillDeduction&&<span style={{fontSize:"11px",color:"#FBBF24",marginLeft:"6px"}}>bill</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
              <div style={{fontSize:"14px",fontWeight:"600",color:e.isIncome?"#34D399":"#fff"}}>{e.isIncome?"+":""}{sym}{e.amount.toFixed(2)}</div>
              {editable(e) && (
                <button onClick={()=>setEntries(prev=>prev.filter(x=>x.id!==e.id))} style={{background:"rgba(248,113,113,0.12)",border:"none",borderRadius:"8px",width:"28px",height:"28px",color:"#F87171",cursor:"pointer",fontSize:"15px"}}>×</button>
              )}
            </div>
          </div>
        ))}

        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"18px",padding:"16px",margin:"20px 0"}}>
          <div style={{display:"flex",gap:"6px",marginBottom:"10px",background:"rgba(0,0,0,0.2)",borderRadius:"12px",padding:"4px"}}>
            {["expense","income"].map(k=>(
              <button key={k} onClick={()=>setKind(k)} style={{flex:1,padding:"8px",borderRadius:"9px",border:"none",background:kind===k?"rgba(255,255,255,0.08)":"transparent",color:kind===k?"#fff":"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"13px",cursor:"pointer",textTransform:"capitalize"}}>{k}</button>
            ))}
          </div>
          <input placeholder={kind==="income"?"What was it? (optional)":"What was it for? (optional)"} value={label} onChange={e=>setLabel(e.target.value)} style={{...field,width:"100%",marginBottom:"10px"}}/>
          <div style={{display:"flex",gap:"8px"}}>
            <input type="number" inputMode="decimal" placeholder={`${sym}0.00`} value={amount} onChange={e=>setAmount(e.target.value)} style={{...field,flex:1}}/>
            <button onClick={add} style={{...field,background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.3)",color:"#A78BFA",fontWeight:"700",cursor:"pointer"}}>+ Add</button>
          </div>
        </div>

        <button onClick={()=>onSave(entries)} style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",border:"none",borderRadius:"16px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"15px",cursor:"pointer"}}>Save changes</button>
        <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",textAlign:"center",marginTop:"10px",lineHeight:1.6}}>
          Your balance and today's budget update to match. Savings for this day are recalculated if it's in the current pay period.
        </div>
      </div>
    </div>
  );
}

function HistorySheet({ open, onClose, history, sym, streak, totalWins, streakHistory, potHistoryLog, onEditDay }) {
  const [translateY, setTranslateY] = React.useState(0);
  const startY = React.useRef(null);
  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e) => { const dy = e.touches[0].clientY - startY.current; if(dy>0) setTranslateY(dy); };
  const handleTouchEnd   = () => { if(translateY>80){setTranslateY(0);onClose();}else setTranslateY(0); };
  const [tab, setTab] = React.useState("spending");

  if (!open) return null;
  const grouped = {};
  [...history].reverse().forEach(h=>{
    const key = monthLabel(h.date);
    if(!grouped[key]) grouped[key]=[];
    grouped[key].push(h);
  });
  const week = [...history].slice(-7);
  const maxH = Math.max(...week.map(h=>h.spent),1);
  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div
        style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",maxHeight:"85vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)",transform:`translateY(${translateY}px)`,transition:translateY===0?"transform 0.3s ease":"none"}}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      >
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px",cursor:"grab"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.3)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff",marginBottom:"16px"}}>History</div>

          {/* Tabs */}
          <div style={{display:"flex",gap:"6px",marginBottom:"20px",background:"rgba(0,0,0,0.2)",borderRadius:"14px",padding:"4px"}}>
            {[{id:"spending",label:"Spending"},{id:"streak",label:"Streak"},{id:"savings",label:"Savings"}].map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                flex:1,padding:"9px",borderRadius:"10px",border:"none",
                background:tab===t.id?"rgba(255,255,255,0.08)":"transparent",
                color:tab===t.id?"#fff":"rgba(255,255,255,0.35)",
                fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"13px",cursor:"pointer"
              }}>{t.label}</button>
            ))}
          </div>

          {/* Spending tab */}
          {tab==="spending"&&(history.length===0 ? (
            <div style={{textAlign:"center",padding:"40px 0",color:"rgba(255,255,255,0.25)",fontSize:"14px"}}>Your daily summaries will appear here</div>
          ) : (
            <>
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"16px",padding:"16px",marginBottom:"20px",display:"flex",alignItems:"flex-end",gap:"6px",height:"72px",justifyContent:"space-around"}}>
                {week.map((h,i)=>(
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"4px",flex:1}}>
                    <div style={{width:"100%",maxWidth:"32px",height:`${Math.max((h.spent/maxH)*50,4)}px`,background:h.under?"#34D399":"#F87171",borderRadius:"4px 4px 2px 2px"}}/>
                    <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)"}}>{shortDate(h.date)}</div>
                  </div>
                ))}
              </div>
              {Object.entries(grouped).map(([month,days])=>{
                const monthWins=days.filter(d=>d.under).length;
                const monthSpent=days.reduce((s,d)=>s+d.spent,0);
                return (
                  <div key={month} style={{marginBottom:"20px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                      <div style={{fontSize:"13px",color:"#A78BFA",fontWeight:"600"}}>{month}</div>
                      <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)"}}>{monthWins}/{days.length} days · {sym}{monthSpent.toFixed(2)}</div>
                    </div>
                    {days.map((h,i)=>(
                      <div key={i} onClick={()=>onEditDay?.(h.date)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",cursor:"pointer"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                          <span style={{fontSize:"16px"}}>{h.under?"✅":"❌"}</span>
                          <div>
                            <div style={{fontWeight:"600",fontSize:"14px",color:"#fff"}}>{shortDate(h.date)}</div>
                            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>
                              Budget {sym}{h.budget.toFixed(2)}
                              {h.unlogged&&<span style={{color:"#FBBF24",marginLeft:"6px"}}>· not opened — tap to add</span>}
                              {h.edited&&!h.unlogged&&<span style={{color:"#A78BFA",marginLeft:"6px"}}>· edited</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontWeight:"700",fontSize:"14px",color:h.under?"#34D399":"#F87171"}}>{sym}{h.spent.toFixed(2)}</div>
                          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>
                            {h.under?`saved ${sym}${(h.budget-h.spent).toFixed(2)}`:`over ${sym}${(h.spent-h.budget).toFixed(2)}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          ))}

          {/* Streak tab */}
          {tab==="streak"&&(
            streakHistory.length===0 ? (
              <div style={{textAlign:"center",padding:"40px 0",color:"rgba(255,255,255,0.25)",fontSize:"14px"}}>
                <div style={{fontSize:"32px",marginBottom:"10px",opacity:0.3}}>🔥</div>
                Your streak history will appear here after your first payday
              </div>
            ) : (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
                  <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>Current streak</div>
                  <div style={{fontSize:"20px",fontWeight:"700",color:"#FBBF24",fontFamily:"'Cormorant Garamond',serif"}}>{streak} days</div>
                </div>
                {streakHistory.map((h,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                    <div>
                      <div style={{fontSize:"13px",color:"#fff",fontWeight:"600"}}>{h.label}</div>
                      <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>Pay period ending</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <div style={{fontSize:"22px",fontWeight:"700",color:"#FBBF24",fontFamily:"'Cormorant Garamond',serif"}}>{h.streak}</div>
                      <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)"}}>days</div>
                    </div>
                  </div>
                ))}
              </>
            )
          )}

          {/* Savings tab */}
          {tab==="savings"&&(
            potHistoryLog.length===0 ? (
              <div style={{textAlign:"center",padding:"40px 0",color:"rgba(255,255,255,0.25)",fontSize:"14px"}}>
                <div style={{fontSize:"32px",marginBottom:"10px",opacity:0.3}}>💰</div>
                Your savings history will appear here after your first payday
              </div>
            ) : (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
                  <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>This period</div>
                  <div style={{fontSize:"20px",fontWeight:"700",color:"#34D399",fontFamily:"'Cormorant Garamond',serif"}}>{sym}{(potHistoryLog[0]?.amount||0).toFixed(2)}</div>
                </div>
                {potHistoryLog.map((h,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                    <div>
                      <div style={{fontSize:"13px",color:"#fff",fontWeight:"600"}}>{h.label}</div>
                      <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>Pay period ending</div>
                    </div>
                    <div style={{fontSize:"18px",fontWeight:"700",color:"#34D399",fontFamily:"'Cormorant Garamond',serif"}}>{sym}{h.amount.toFixed(2)}</div>
                  </div>
                ))}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FAQ Components ───────────────────────────────────────────────────────────
const FAQ_SECTIONS = [
  {
    title:"📱 General",
    items:[
      {q:"How do I switch between Calculator and Pro mode?", a:"Use the toggle at the top of the main screen. The app remembers which mode you were using when you come back."},
      {q:"How is my daily budget calculated?", a:"Your daily budget is set at the start of each day by dividing your current balance by the number of days until payday. It's locked for the entire day so you always have a consistent target to aim for. In Calculator mode you update your balance manually whenever you like and the budget recalculates instantly. In Pro mode it locks in at the start of the day and only changes if you update your balance in Settings."},
      {q:"How do I update my pay schedule or currency?", a:"Tap Settings in the bottom bar. From there you can update your balance, pay schedule, currency and monthly income."},
      {q:"When does my day reset?", a:"At midnight your day closes automatically. Your balance is updated, a summary appears when you next open the app, and a fresh daily budget is calculated for the new day."},
      {q:"What if I don't open the app for a few days?", a:"No problem — the app automatically catches up on missed days when you next open it. Bills due on those days are deducted, payday is processed if it passed, and your history is updated."},
      {q:"Does Day Pay connect to my bank?", a:"No. Day Pay does not connect to any bank. All data is entered manually and saved locally on your device. Nothing leaves your phone."},
      {q:"Is my data safe?", a:"Yes. Everything is stored locally on your device. There are no accounts, no servers, and no data is ever sent anywhere."},
    ]
  },
  {
    title:"🧮 Calculator",
    items:[
      {q:"What is Calculator mode?", a:"Calculator mode is the simplest way to use Day Pay. Enter your balance and payday, and the app tells you exactly how much you can spend each day. Tap Update balance whenever your balance changes and your daily budget recalculates instantly. No expense tracking, no logging — just the number."},
      {q:"How do I update my balance?", a:"Tap the green Update balance button on the main screen. A numpad appears — type your current balance and tap Update. Your daily budget recalculates immediately."},
      {q:"Does my balance reset when I close the app?", a:"No — your balance and daily budget are saved on your device and will be exactly as you left them when you reopen the app."},
      {q:"What is the balance history chart?", a:"Every time you update your balance it gets logged and shown as a bar chart covering the last 7 days. Green bars mean your balance held steady or went up. Red bars mean it dropped. The brightest bar is today. It gives you a quick visual of how your balance has been moving over the week."},
    ]
  },
  {
    title:"⭐ Pro",
    items:[

      {q:"Does adding expenses change my daily budget?", a:"No — expenses only affect What's Left for today. Your daily budget stays fixed all day regardless of what you've logged."},
      {q:"What is 'What's Left'?", a:"What's Left is your daily budget minus today's expenses. It goes down as you spend and is separate from your current balance."},
      {q:"What happens when I add income?", a:"Income added to your main account updates your current balance immediately. It doesn't change today's daily budget but feeds into tomorrow's calculation when the day resets."},
      {q:"How do credit cards work?", a:"Add your credit cards in the Cards section. Credit card expenses are tracked separately and don't affect your daily budget — because the money hasn't actually left your account yet. Each card shows what you currently owe."},
      {q:"How do I pay off my credit card?", a:"Use Income mode and select Pay [card name]. This reduces what you owe and deducts from your current balance. If the payment already left automatically, use Pay [card name] (no deduct) to just update the balance owed without touching your current balance."},
      {q:"What are recurring bills?", a:"Bills are regular payments like Netflix or rent. Add them with a name, amount, frequency and due date. Choose Reserve daily to spread the cost across your daily budget until the bill is due, or Deduct on the day to leave your budget unchanged and take the full amount on the due date."},
      {q:"What's the difference between Reserve daily and Deduct on the day?", a:"Reserve daily drops your daily budget a little each day until the bill is due — no surprise on the day. Deduct on the day keeps your budget the same and the full amount hits like a regular expense. Use Reserve daily for big bills like rent, and Deduct on the day for smaller ones like subscriptions."},
      {q:"How does the streak work?", a:"Your streak counts consecutive days under budget without manually adjusting your balance. Updating your balance pauses the streak for that day but doesn't break it. Going over budget doesn't reset it either — the streak just won't extend. At the end of each pay period your streak is logged to History."},
      {q:"How does the savings pot work?", a:"Every day you close under budget without adjusting your balance, the amount saved is added to your pot. Set your own goal by tapping it. The pot resets each payday and logs your total so you can see how much you saved each pay period in History."},
      {q:"Why does it say 'Balance updated today — Streak paused · No savings added'?", a:"This appears when you've updated your balance in Settings that day. To keep things fair the app skips that day for your streak and savings pot, since the balance change could affect what counts as under budget. Your existing streak and savings are safe."},
      {q:"Can I add something I forgot to log?", a:"Yes — open History and tap any day to add or remove expenses and income. Your balance and today's budget update to match."},
    ]
  },
];

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{marginBottom:"8px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"14px",overflow:"hidden"}}>
      <button onClick={()=>setOpen(v=>!v)} style={{width:"100%",padding:"14px 16px",background:"none",border:"none",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <span style={{fontSize:"13px",color:"#fff",fontWeight:"600",textAlign:"left",flex:1,paddingRight:"12px"}}>{item.q}</span>
        <span style={{color:"rgba(255,255,255,0.3)",fontSize:"18px",flexShrink:0,transition:"transform 0.2s",display:"inline-block",transform:open?"rotate(45deg)":"rotate(0deg)"}}>+</span>
      </button>
      {open&&(
        <div style={{padding:"0 16px 14px",fontSize:"13px",color:"rgba(255,255,255,0.55)",lineHeight:1.7}}>{item.a}</div>
      )}
    </div>
  );
}

function FaqList() {
  return (
    <>
      {FAQ_SECTIONS.map((section,si)=>(
        <div key={si} style={{marginBottom:"24px"}}>
          <div style={{fontSize:"13px",color:"#fff",fontWeight:"700",marginBottom:"10px",paddingBottom:"8px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>{section.title}</div>
          {section.items.map((item,i)=><FaqItem key={i} item={item}/>)}
        </div>
      ))}
    </>
  );
}

function SettingsSheet({ open, onClose, setup, onSave }) {
  const [translateY, setTranslateY] = React.useState(0);
  const startY = React.useRef(null);
  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e) => { const dy = e.touches[0].clientY - startY.current; if(dy>0) setTranslateY(dy); };
  const handleTouchEnd   = () => { if(translateY>80){setTranslateY(0);onClose();}else setTranslateY(0); };

  const [balance,   setBalance]   = useState(String(setup.currentBalance));
  const [salary,    setSalary]    = useState(String(setup.monthlySalary));
  const [currency,  setCurrency]  = useState(setup.currency);
  const [payConfig, setPayConfig] = useState(setup.payConfig||{frequency:"monthly",monthDay:"last_working"});
  const [showFaq,   setShowFaq]   = useState(false);
  const sym = CURRENCIES.find(c=>c.code===currency)?.symbol||"£";

  useEffect(()=>{
    if(open){
      setBalance(String(setup.currentBalance));
      setSalary(String(setup.monthlySalary));
      setCurrency(setup.currency);
      setPayConfig(setup.payConfig||{frequency:"monthly",monthDay:"last_working"});
    }
  },[open]);

  if(!open) return null;

  const nextPayday = getNextPayday(null, null, payConfig);
  const days = daysUntilPayday(nextPayday);

  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div
        style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",maxHeight:"92vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)",transform:`translateY(${translateY}px)`,transition:translateY===0?"transform 0.3s ease":"none"}}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      >
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px",cursor:"grab"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.3)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",marginBottom:"24px",color:"#fff"}}>Settings</div>

          {/* Currency */}
          <div style={{marginBottom:"20px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px"}}>Currency</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px"}}>
              {CURRENCIES.map(c=>(
                <button key={c.code} onClick={()=>setCurrency(c.code)} style={{padding:"10px 4px",borderRadius:"12px",border:`1px solid ${currency===c.code?"rgba(167,139,250,0.5)":"rgba(255,255,255,0.07)"}`,background:currency===c.code?"rgba(167,139,250,0.25)":"rgba(255,255,255,0.05)",color:currency===c.code?"#A78BFA":"rgba(255,255,255,0.5)",fontFamily:"'DM Sans',sans-serif",fontSize:"12px",fontWeight:"600",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"2px"}}>
                  <span style={{fontSize:"16px"}}>{c.symbol}</span>
                  <span style={{fontSize:"10px",opacity:0.7}}>{c.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pay schedule */}
          <div style={{marginBottom:"20px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px"}}>Pay Schedule</div>
            <PayScheduleBuilder payConfig={payConfig} onChange={setPayConfig}/>
          </div>

          {/* Balance */}
          <div style={{marginBottom:"16px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>Current Balance</div>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:"16px",top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.3)",fontSize:"18px"}}>{sym}</span>
              <input type="number" value={balance} onChange={e=>setBalance(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"14px",padding:"14px 16px 14px 40px",color:"#fff",fontFamily:"'Cormorant Garamond',serif",fontSize:"22px",fontWeight:"600",outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>

          {/* Salary */}
          <div style={{marginBottom:"24px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>Monthly Income</div>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:"16px",top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.3)",fontSize:"18px"}}>{sym}</span>
              <input type="number" value={salary} onChange={e=>setSalary(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"14px",padding:"14px 16px 14px 40px",color:"#fff",fontFamily:"'Cormorant Garamond',serif",fontSize:"22px",fontWeight:"600",outline:"none",boxSizing:"border-box"}}/>
            </div>

          </div>


          <button onClick={()=>{
            const bal=parseFloat(balance)||0;
            const sal=parseFloat(salary)||0;
            if(bal>0) onSave({currentBalance:bal,monthlySalary:sal,currency,payConfig});
            onClose();
          }} style={{width:"100%",padding:"16px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",border:"none",borderRadius:"16px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",cursor:"pointer",boxShadow:"0 6px 24px rgba(167,139,250,0.3)"}}>
            Save Changes
          </button>



          {/* Feedback */}
          <div style={{marginTop:"24px",paddingTop:"20px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px"}}>Share your thoughts</div>
            <a href="mailto:daypayteam@gmail.com?subject=Day Pay Feedback&body=Hi, here's my feedback on Day Pay:%0A%0A" style={{display:"block",textDecoration:"none"}}>
              <div style={{width:"100%",padding:"14px",background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:"14px",color:"#A78BFA",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"14px",textAlign:"center",cursor:"pointer"}}>
                ✉️ Send Feedback
              </div>
            </a>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.25)",textAlign:"center",marginTop:"6px"}}>Your feedback goes directly to the team</div>
          </div>

          <div style={{textAlign:"center",marginTop:"24px",paddingTop:"20px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.2)",lineHeight:1.8}}>
              Created by
            </div>
            <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",fontWeight:"600"}}>
              Wayne Gladman
            </div>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.2)"}}>
              London, United Kingdom 🇬🇧
            </div>
          </div>
        </div>
      </div>
      {showFaq&&(
        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",overflowY:"auto",zIndex:10,animation:"sheetUp 0.3s ease"}}>
          <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
            <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.3)"}}/>
          </div>
          <div style={{padding:"0 24px 48px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff"}}>How Day Pay Works</div>
              <button onClick={()=>setShowFaq(false)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px",padding:"8px 12px",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:"14px"}}>Back</button>
            </div>
            <FaqList/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onComplete }) {
  const [step,       setStep]       = useState(0);
  const [currency,   setCurrency]   = useState("GBP");
  const [payConfig,  setPayConfig]  = useState({ frequency:"monthly", monthDay:"last_working" });
  const [salInput,   setSalInput]   = useState("");
  const [balInput,   setBalInput]   = useState("");
  const [activeField,setActiveField]= useState("balance");

  const sym = CURRENCIES.find(c=>c.code===currency)?.symbol||"£";
  const nextPayday = getNextPayday(null, null, payConfig);
  const days = daysUntilPayday(nextPayday);
  const salNum = parseFloat(salInput)||0;
  const balNum = parseFloat(balInput)||0;
  const daily  = days>0&&balNum>0 ? balNum/days : 0;

  const handleNum = (field, key) => {
    const setter = field==="salary"?setSalInput:setBalInput;
    const cur    = field==="salary"?salInput:balInput;
    if(key==="⌫"){ setter(cur.slice(0,-1)||""); return; }
    if(key==="." && cur.includes(".")) return;
    if(cur==="0"&&key!=="."){setter(key);return;}
    if(cur.length>=10) return;
    setter(p=>p+key);
  };

  return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 15%,#1a1040 0%,#0a0a18 55%,#0d1a0a 100%)",display:"flex",flexDirection:"column",padding:"32px 24px",fontFamily:"'DM Sans',sans-serif",color:"#fff",maxWidth:"420px",margin:"0 auto",overflowY:"auto"}}>
      <div style={{textAlign:"center",marginBottom:"24px"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"38px",fontWeight:"700",letterSpacing:"-0.5px"}}>Day Pay</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>Budgeting that makes every day, Pay Day</div>
      </div>

      {/* Step dots */}
      <div style={{display:"flex",gap:"6px",marginBottom:"28px"}}>
        {["Currency","Pay Day","Income","Balance"].map((s,i)=>(
          <div key={i} style={{flex:1}}>
            <div style={{height:"4px",borderRadius:"2px",background:i<=step?"#A78BFA":"rgba(255,255,255,0.1)",transition:"background 0.3s"}}/>
            <div style={{fontSize:"9px",color:i===step?"#A78BFA":"rgba(255,255,255,0.25)",marginTop:"4px",textAlign:"center"}}>{s}</div>
          </div>
        ))}
      </div>

      {/* ── Step 0: Currency ── */}
      {step===0&&(
        <div style={{animation:"slideUp 0.35s ease"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"28px",fontWeight:"700",marginBottom:"20px"}}>What's your currency?</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px",marginBottom:"28px"}}>
            {CURRENCIES.map(c=>(
              <button key={c.code} onClick={()=>setCurrency(c.code)} style={{padding:"16px 8px",borderRadius:"16px",border:`1px solid ${currency===c.code?"rgba(167,139,250,0.5)":"rgba(255,255,255,0.07)"}`,background:currency===c.code?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.05)",color:currency===c.code?"#A78BFA":"rgba(255,255,255,0.5)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
                <span style={{fontSize:"22px"}}>{c.symbol}</span>
                <span style={{fontSize:"11px",fontWeight:"600"}}>{c.code}</span>
              </button>
            ))}
          </div>
          <button onClick={()=>setStep(1)} style={{width:"100%",padding:"18px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",border:"none",borderRadius:"18px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",cursor:"pointer",boxShadow:"0 8px 30px rgba(167,139,250,0.3)"}}>Continue →</button>
        </div>
      )}

      {/* ── Step 1: Pay schedule ── */}
      {step===1&&(
        <div style={{animation:"slideUp 0.35s ease"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"28px",fontWeight:"700",marginBottom:"8px"}}>When do you get paid?</div>
          <div style={{fontSize:"14px",color:"rgba(255,255,255,0.4)",lineHeight:1.6,marginBottom:"20px"}}>We'll automatically add your income on payday and ask you to confirm your balance.</div>
          <PayScheduleBuilder payConfig={payConfig} onChange={setPayConfig}/>
          <div style={{display:"flex",gap:"10px",marginTop:"20px"}}>
            <button onClick={()=>setStep(0)} style={{padding:"18px 20px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"18px",color:"rgba(255,255,255,0.5)",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"14px",cursor:"pointer"}}>←</button>
            <button onClick={()=>setStep(2)} style={{flex:1,padding:"18px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",border:"none",borderRadius:"18px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",cursor:"pointer",boxShadow:"0 8px 30px rgba(167,139,250,0.3)"}}>Continue →</button>
          </div>
        </div>
      )}

      {/* ── Step 2: Income ── */}
      {step===2&&(
        <div style={{animation:"slideUp 0.35s ease"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"28px",fontWeight:"700",marginBottom:"8px"}}>Monthly income?</div>
          <div style={{fontSize:"14px",color:"rgba(255,255,255,0.4)",lineHeight:1.6,marginBottom:"16px"}}>Your take-home pay. We'll add this automatically on payday.</div>
          <div style={{background:"rgba(0,0,0,0.3)",borderRadius:"16px",padding:"16px",marginBottom:"14px",textAlign:"right"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"44px",fontWeight:"700",color:salInput?"#A78BFA":"rgba(255,255,255,0.2)"}}>{sym}{salInput||"0"}</div>
          </div>
          <div style={{marginBottom:"16px"}}><NumPad onKey={k=>handleNum("salary",k)}/></div>
          <div style={{display:"flex",gap:"10px"}}>
            <button onClick={()=>setStep(1)} style={{padding:"18px 20px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"18px",color:"rgba(255,255,255,0.5)",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"14px",cursor:"pointer"}}>←</button>
            <button onClick={()=>{if(salNum>0)setStep(3);}} disabled={salNum<=0} style={{flex:1,padding:"18px",background:salNum>0?"linear-gradient(135deg,#A78BFA,#7C3AED)":"rgba(255,255,255,0.05)",border:"none",borderRadius:"18px",color:salNum>0?"#fff":"rgba(255,255,255,0.2)",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",cursor:salNum>0?"pointer":"default",boxShadow:salNum>0?"0 8px 30px rgba(167,139,250,0.3)":"none"}}>Continue →</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Current balance ── */}
      {step===3&&(
        <div style={{animation:"slideUp 0.35s ease"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"28px",fontWeight:"700",marginBottom:"8px"}}>Current balance?</div>
          <div style={{fontSize:"14px",color:"rgba(255,255,255,0.4)",lineHeight:1.6,marginBottom:"8px"}}>
            What's actually in your account right now?
          </div>

          {/* Tooltip explaining calculation */}
          <div style={{background:"rgba(167,139,250,0.07)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:"12px",padding:"12px 14px",marginBottom:"14px",display:"flex",gap:"10px",alignItems:"flex-start"}}>
            <span style={{fontSize:"16px",flexShrink:0}}>💡</span>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",lineHeight:1.65}}>
              Your daily budget is calculated using <span style={{color:"#A78BFA",fontWeight:"600"}}>only your current balance</span>, divided by the days until payday — not including payday itself. This keeps your spending based purely on the money you already have in hand.
            </div>
          </div>

          <div style={{background:"rgba(0,0,0,0.3)",borderRadius:"16px",padding:"16px",marginBottom:"8px",textAlign:"right"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"44px",fontWeight:"700",color:balInput?"#34D399":"rgba(255,255,255,0.2)"}}>{sym}{balInput||"0"}</div>
          </div>
          {daily>0&&<div style={{fontSize:"13px",color:"#34D399",fontWeight:"600",textAlign:"center",marginBottom:"12px"}}>= {sym}{daily.toFixed(2)} / day for {days} days</div>}
          <div style={{marginBottom:"16px"}}><NumPad onKey={k=>handleNum("balance",k)}/></div>
          <div style={{display:"flex",gap:"10px"}}>
            <button onClick={()=>setStep(2)} style={{padding:"18px 20px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"18px",color:"rgba(255,255,255,0.5)",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"14px",cursor:"pointer"}}>←</button>
            <button onClick={()=>{
              if(balNum>0) onComplete({monthlySalary:salNum,currentBalance:balNum,currency,payConfig,nextPayday});
            }} disabled={balNum<=0} style={{flex:1,padding:"18px",background:balNum>0?"linear-gradient(135deg,#34D399,#059669)":"rgba(255,255,255,0.05)",border:"none",borderRadius:"18px",color:balNum>0?"#061a0e":"rgba(255,255,255,0.2)",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",cursor:balNum>0?"pointer":"default",boxShadow:balNum>0?"0 8px 30px rgba(52,211,153,0.28)":"none"}}>
              {balNum>0?`Start — ${sym}${daily.toFixed(2)}/day 🚀`:"Enter balance to begin"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function DayPay() {
  const saved = loadAll();

  const [setup,           setSetup]           = useState(saved?.setup           ?? null);
  const [display,         setDisplay]         = useState("0");
  const [expenses,        setExpenses]        = useState(saved?.expenses        ?? []);
  const [label,           setLabel]           = useState("");
  const [history,         setHistory]         = useState(saved?.history         ?? []);
  const [showCalc,           setShowCalc]           = useState(false);
  const [isIncome,           setIsIncome]           = useState(false);
  const [incomeDestination,  setIncomeDestination]  = useState("main");
  const [incomeDeductBalance,setIncomeDeductBalance]= useState(true);
  const [showTransactions,   setShowTransactions]   = useState(false);
  const [showSettings,       setShowSettings]       = useState(false);
  const [showHistory,        setShowHistory]        = useState(false);
  const [daySummary,         setDaySummary]         = useState(saved?.pendingSummary  ?? null);
  const [paydayModal,        setPaydayModal]        = useState(saved?.pendingPayday   ?? null);
  const [lastClosedDate,     setLastClosedDate]     = useState(saved?.lastClosedDate  ?? todayISO());
  const [showBudgetTip,      setShowBudgetTip]      = useState(false);
  const [appMode,            setAppMode]            = useState(saved?.appMode            ?? "pro"); // "calculator" or "pro"
  const [showUpdateBalance,  setShowUpdateBalance]  = useState(false);
  const [balanceLog,         setBalanceLog]         = useState(saved?.balanceLog ?? []);
  const [lockedDailyBudget,  setLockedDailyBudget]  = useState(saved?.lockedDailyBudget ?? null);
  const [bills,              setBills]              = useState(saved?.bills              ?? []);
  const [creditCards,        setCreditCards]        = useState(saved?.creditCards        ?? []);
  const [showBills,          setShowBills]          = useState(false);
  const [showCreditCards,    setShowCreditCards]    = useState(false);
  const [savingsPot,         setSavingsPot]         = useState(saved?.savingsPot         ?? 0);
  const [potGoal,            setPotGoal]            = useState(saved?.potGoal            ?? 200);
  const [potHistory,         setPotHistory]         = useState(saved?.potHistory         ?? []);
  const [balanceAdjustedToday,setBalanceAdjustedToday]= useState(saved?.balanceAdjustedToday ?? false);
  const [streakHistory,      setStreakHistory]      = useState(saved?.streakHistory      ?? []);
  const [potHistoryLog,      setPotHistoryLog]      = useState(saved?.potHistoryLog      ?? []);
  const [periodStart,        setPeriodStart]        = useState(saved?.periodStart        ?? null);
  const [editingDay,         setEditingDay]         = useState(null);
  const [editingPotGoal,  setEditingPotGoal]  = useState(false);
  const [showFaqMain,     setShowFaqMain]     = useState(false);
  const labelRef = useRef(null);

  // Persist everything
  useEffect(()=>{
    saveAll({setup,expenses,history,pendingSummary:daySummary,pendingPayday:paydayModal,lastClosedDate,bills,creditCards,lockedDailyBudget,savingsPot,potGoal,potHistory,balanceAdjustedToday,streakHistory,potHistoryLog,periodStart,appMode,balanceLog});
  },[setup,expenses,history,daySummary,paydayModal,lastClosedDate,bills,creditCards,savingsPot,potGoal,potHistory,balanceAdjustedToday,streakHistory,potHistoryLog,lockedDailyBudget,periodStart,appMode,balanceLog]);

  // On app open — check if day has changed
  useEffect(()=>{
    if(!setup) return;
    const today = todayISO();
    if(lastClosedDate && lastClosedDate !== today){
      runDayClose(lastClosedDate);
    }
  },[]);

  // Lock the daily budget at start of each day.
  // If a day close is pending, runDayClose sets the lock from the post-close balance instead.
  useEffect(()=>{
    if(!setup) return;
    if(lastClosedDate && lastClosedDate!==todayISO()) return;
    if(lockedDailyBudget!=null) return;
    const np = setup.nextPayday || getNextPayday(null, null, setup.payConfig);
    setLockedDailyBudget(calcDailyBudget(setup.currentBalance, bills, np));
  },[]);

  // Check every minute for midnight rollover
  useEffect(()=>{
    if(!setup) return;
    const iv = setInterval(()=>{
      const today = todayISO();
      const stored = loadAll();
      if(stored?.lastClosedDate && stored.lastClosedDate !== today){
        runDayClose(stored.lastClosedDate);
      }
    },60000);
    return ()=>clearInterval(iv);
  },[setup]);

  // Closes every day from lastClosed up to yesterday, one day at a time, so days the
  // app wasn't opened still get their bills, payday, budget and savings handled correctly.
  const runDayClose = (lastClosed) => {
    const stored = loadAll();
    if(!stored?.setup) return;
    const today = todayISO();
    if(!lastClosed || lastClosed >= today) return;

    const s0          = stored.setup;
    const storedBills = stored.bills ?? [];
    let balance   = s0.currentBalance;
    let payday    = s0.nextPayday || getNextPayday(null, null, s0.payConfig, parseISO(lastClosed));
    let locked    = stored.lockedDailyBudget ?? calcDailyBudget(balance, storedBills, payday, lastClosed);
    let pot       = stored.savingsPot ?? 0;
    let potHist   = [...(stored.potHistory ?? [])];
    let potLog    = [...(stored.potHistoryLog ?? [])];
    let streakLog = [...(stored.streakHistory ?? [])];
    let hist      = [...(stored.history ?? [])];
    let periodStart = stored.periodStart ?? null;
    let adjusted  = stored.balanceAdjustedToday ?? false;
    let entries   = stored.expenses ?? [];
    let paydayHit = false;
    let lastSummary = null;
    let closedCount = 0;

    let d = lastClosed;
    for(let guard=0; d < today && guard < 400; guard++){
      if(payday <= d) payday = getNextPayday(null, null, s0.payConfig, parseISO(d));
      const next = addDaysISO(d, 1);

      // Bills that hit at the start of the next day
      const dueBills = storedBills.filter(b => billDueOn(b, parseISO(next))).map(b => ({
        id:`bill_auto_${b.id}_${next}`, label:b.name, amount:b.amount,
        auto:true, isBillDeduction:true, accountId:b.accountId||"main"
      }));
      const billsPaid = dueBills.filter(b=>b.accountId==="main").reduce((t,b)=>t+b.amount,0);

      const { regular, spent } = summariseEntries(entries);
      const isUnder = spent < locked;
      const summary = {
        date:d, spent, budget:locked, under:isUnder, expenses:[...entries, ...dueBills],
        adjusted, unlogged: closedCount>0   // days the app was never opened
      };
      hist.push(summary);
      lastSummary = summary;

      // Only regular spending leaves the balance here — payoffs/income were applied when logged
      balance = Math.max(0, balance - regular - billsPaid);

      // Savings pot for the day just closed (added before any payday reset).
      // Days the app wasn't opened don't earn savings until the user reviews them in History.
      const saving = Math.max(0, locked - spent);
      if(isUnder && !adjusted && saving > 0 && closedCount===0){
        pot = parseFloat((pot + saving).toFixed(2));
        potHist = [{date:d, amount:saving}, ...potHist].slice(0,30);
      }

      // Payday lands on the next day
      if(next === payday){
        let streakNow = 0;
        for(let i=hist.length-1;i>=0;i--){ if(hist[i].under&&!hist[i].adjusted) streakNow++; else break; }
        if(streakNow>0) streakLog = [{streak:streakNow, date:d, label:shortDate(payday)}, ...streakLog].slice(0,24);
        if(pot>0)       potLog    = [{amount:pot, date:d, label:shortDate(payday)}, ...potLog].slice(0,24);
        pot = 0; potHist = [];
        balance = balance + s0.monthlySalary;
        periodStart = next;
        paydayHit = true;
        payday = getNextPayday(null, null, s0.payConfig, parseISO(next));
      }

      locked   = calcDailyBudget(balance, storedBills, payday, next);
      entries  = [];
      adjusted = false;
      closedCount++;
      d = next;
    }

    setHistory(hist);
    setExpenses([]);
    setDisplay("0");
    setSetup(prev=>({...prev, currentBalance:balance, nextPayday:payday}));
    setLockedDailyBudget(locked);
    setSavingsPot(pot);
    setPotHistory(potHist);
    setPotHistoryLog(potLog);
    setStreakHistory(streakLog);
    setPeriodStart(periodStart);
    setBalanceAdjustedToday(false);
    setLastClosedDate(today);
    setDaySummary(lastSummary ? {...lastSummary, awayDays: closedCount>1 ? closedCount-1 : 0} : null);
    if(paydayHit) setPaydayModal({suggestedBalance:balance});
  };



  if(!setup) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes popIn{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.6) sepia(1) saturate(3) hue-rotate(220deg);cursor:pointer}
        button:active{transform:scale(0.96)}
      `}</style>
      <SetupScreen onComplete={s=>{
        const np = s.nextPayday || getNextPayday(null, null, s.payConfig);
        setSetup({...s, nextPayday:np});
        setLastClosedDate(todayISO());
      }}/>
    </>
  );

  const { currency, currentBalance, nextPayday: storedPayday, paySchedule, customPayDate, monthlySalary } = setup;
  const sym      = CURRENCIES.find(c=>c.code===currency)?.symbol||"£";
  const payday   = storedPayday || getNextPayday(null, null, setup.payConfig);
  const days     = daysUntilPayday(payday);
  // Money set aside for bills due between tomorrow and payday
  const reservedBills   = reservedForBills(bills, payday);
  // Use locked daily budget (set at start of day) — changes with settings updates or bill changes
  const daily           = lockedDailyBudget ?? calcDailyBudget(currentBalance, bills, payday);

  // When bills are added/removed mid-day, shift today's locked budget by the change in reserved money
  // (keeps the "locked for the day" behaviour but reflects new commitments immediately)
  const updateBills = (nextBills) => {
    const delta = reservedForBills(nextBills, payday) - reservedBills;
    if(delta!==0 && lockedDailyBudget!=null){
      setLockedDailyBudget(parseFloat(Math.max(0, lockedDailyBudget - delta/Math.max(days,1)).toFixed(2)));
    }
    setBills(nextBills);
  };

  // Edit a day that's already closed: fix its record, then ripple the difference into
  // the balance, today's budget and (if it's this pay period) the savings pot.
  const editPastDay = (date, newEntries) => {
    const idx = history.findIndex(h=>h.date===date);
    if(idx<0) return;
    const old = history[idx];
    const before = summariseEntries(old.expenses);
    const after  = summariseEntries(newEntries);
    const isUnder = after.spent < old.budget;
    const updated = {...old, expenses:newEntries, spent:after.spent, under:isUnder, unlogged:false, edited:true};
    setHistory(prev=>prev.map((h,i)=>i===idx?updated:h));

    // Balance: less spending → more money, more income → more money
    const balanceDelta = parseFloat(((before.regular - after.regular) + (after.income - before.income)).toFixed(2));
    if(balanceDelta!==0){
      setSetup(prev=>({...prev, currentBalance:Math.max(0, prev.currentBalance + balanceDelta)}));
      if(lockedDailyBudget!=null){
        setLockedDailyBudget(parseFloat(Math.max(0, lockedDailyBudget + balanceDelta/Math.max(days,1)).toFixed(2)));
      }
    }

    // Savings pot — only for days in the current pay period
    const inPotHistory = potHistory.some(p=>p.date===date);
    const oldestPot = potHistory.length ? potHistory[potHistory.length-1].date : null;
    const inPeriod = periodStart ? date >= periodStart : (inPotHistory || (oldestPot && date >= oldestPot));
    if(inPeriod){
      const oldSaving = potHistory.find(p=>p.date===date)?.amount ?? 0;
      const newSaving = (isUnder && !old.adjusted) ? Math.max(0, parseFloat((old.budget - after.spent).toFixed(2))) : 0;
      if(oldSaving!==newSaving){
        setSavingsPot(prev=>Math.max(0, parseFloat((prev - oldSaving + newSaving).toFixed(2))));
        setPotHistory(prev=>{
          const rest = prev.filter(p=>p.date!==date);
          return newSaving>0 ? [...rest, {date, amount:newSaving}].sort((a,b)=>b.date.localeCompare(a.date)) : rest;
        });
      }
    }
  };
  // Regular expenses (not credit card charges, not income entries)
  const spent           = expenses.filter(e=>!e.isCreditCard&&!e.isIncome&&!e.isAutoBalancer).reduce((s,e)=>s+e.amount,0);
  // Credit payoffs that deduct from balance count against "remaining" too
  const creditPayoffDeductions = expenses.filter(e=>e.isCreditPayoff&&e.deductBalance!==false).reduce((s,e)=>s+e.amount,0);
  const todayIncome     = expenses.filter(e=>e.isIncome&&e.destination==="main").reduce((s,e)=>s+e.amount,0);
  const effectiveSpent  = spent + creditPayoffDeductions;
  const remain          = daily - effectiveSpent;
  const pct      = Math.min((effectiveSpent/Math.max(daily,0.01))*100,100);
  const isUnder  = effectiveSpent < daily;
  const barCol   = pct<60?"#34D399":pct<85?"#FBBF24":"#F87171";
  const streak   = (()=>{ let s=0; for(let i=history.length-1;i>=0;i--){if(history[i].under&&!history[i].adjusted)s++;else break;} return s; })();
  const totalWins= history.filter(h=>h.under).length;

  // Count bills due this month that haven't passed yet
  const upcomingBillsCount = bills.filter(b => {
    const today4 = new Date(); today4.setHours(0,0,0,0);
    if(b.frequency==="daily") return true;
    if(b.frequency==="weekly") return true;
    if(b.frequency==="monthly"){
      const dueDay = b.dayOfMonth || 1;
      const dueDate = new Date(today4.getFullYear(), today4.getMonth(), dueDay);
      return dueDate >= today4; // due today or in the future this month
    }
    return false;
  }).length;


  const handleNumKey = (key) => {
    if(key==="⌫"){setDisplay(d=>d.length>1?d.slice(0,-1):"0");return;}
    if(key==="."&&display.includes(".")) return;
    if(display==="0"&&key!=="."){setDisplay(key);return;}
    if(display.length>=10) return;
    setDisplay(d=>d+key);
  };

  const handleAddExpense = () => {
    const amt=parseFloat(display);
    if(!amt||amt<=0) return;
    // The card picker next to the label reuses incomeDestination: "main" or a card id
    const card = !isIncome ? creditCards.find(c=>c.id===incomeDestination) : null;
    const isCredit = !!card;
    const pairId = `pay_${Date.now()}`; // links a card payment to its balance deduction

    if(isIncome){
      // Income: add to chosen destination
      const destAcc = creditCards.find(a=>a.id===incomeDestination);
      if(incomeDestination==="main"){
        setSetup(prev=>({...prev,currentBalance:prev.currentBalance+amt}));
        // Income only affects tomorrow's daily budget — not today's locked value
      } else if(destAcc?.type==="credit"){
        if(incomeDeductBalance){
          // Pay card AND deduct from main balance
          setSetup(prev=>({...prev,currentBalance:prev.currentBalance-amt}));
          // Auto balancing expense so remain updates correctly
          setExpenses(prev=>[...prev,{id:Date.now()+1,label:'Pay '+destAcc.name,amount:amt,account:null,isAutoBalancer:true,linkedCreditCard:destAcc.name,cardId:destAcc.id,pairId}]);
        }
        // Always reduce card balance owed
        setCreditCards(prev=>prev.map(c=>c.id===incomeDestination?{...c,balance:Math.max(0,c.balance-amt)}:c));
      }
      const destAccName = destAcc?.name||null;
      const isCreditPayoff = destAcc?.type==="credit";
      setExpenses(prev=>[...prev,{id:Date.now(),label:label||"Income",amount:amt,account:destAccName,isIncome:true,destination:incomeDestination,isCreditPayoff,deductBalance:incomeDeductBalance,...(isCreditPayoff?{pairId}:{})}]);
    } else {
      if(isCredit){
        // Credit card expense: ONLY increases balance owed on the card — does NOT affect daily budget
        setCreditCards(prev=>prev.map(c=>c.id===card.id?{...c,balance:c.balance+amt}:c));
        setExpenses(prev=>[...prev,{id:Date.now(),label:label||"Expense",amount:amt,account:card.name,cardId:card.id,isCreditCard:true}]);
      } else {
        // Regular expense: counts against today's budget, leaves the balance at day close
        setExpenses(prev=>[...prev,{id:Date.now(),label:label||"Expense",amount:amt,account:null}]);
      }
    }
    setDisplay("0"); setLabel(""); setShowCalc(false); setIsIncome(false); setIncomeDestination("main"); setIncomeDeductBalance(true);
  };

  return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 20% 10%,#0e1a10 0%,#080f12 55%,#0a0a18 100%)",fontFamily:"'DM Sans',sans-serif",color:"#fff",display:"flex",flexDirection:"column",maxWidth:"420px",margin:"0 auto",padding:"20px 20px 16px",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes fall{to{transform:translateY(110vh) rotate(720deg);opacity:0}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideToast{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes popIn{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.6) sepia(1) saturate(3) hue-rotate(220deg);cursor:pointer}
        button:active{transform:scale(0.96)}
      `}</style>



      {/* Modals — priority order */}


      {paydayModal && (
        <PaydayModal
          sym={sym}
          suggestedBalance={paydayModal.suggestedBalance}
          onConfirm={bal=>{
            setSetup(prev=>({...prev,currentBalance:bal}));
            setLockedDailyBudget(calcDailyBudget(bal, bills, payday));
            setPaydayModal(null);
          }}
        />
      )}
      {daySummary && !paydayModal && (
        <DaySummaryModal summary={daySummary} sym={sym} onClose={()=>setDaySummary(null)}/>
      )}

      {/* Sheets */}
      <SettingsSheet open={showSettings} onClose={()=>setShowSettings(false)} setup={{...setup,nextPayday:payday,currentBalance:parseFloat(Math.max(0,currentBalance-spent).toFixed(2))}} onSave={s=>{
        const np = getNextPayday(null, null, s.payConfig||payConfig);
        // Reverse-engineer the true base currentBalance so the front screen shows
        // exactly what the user typed, with all existing transactions intact.
        //
        // Front screen display = currentBalance - spent - creditPayoffDeductions + todayIncome
        // So: currentBalance = newDisplayBalance + spent + creditPayoffDeductions - todayIncome
        //
        // Note: credit card charges (isCreditCard) don't affect currentBalance so excluded.
        // Credit payoffs with deductBalance=true DO reduce currentBalance so included.
        // Secondary account expenses don't touch currentBalance so excluded.
        // Income to main adds to currentBalance so subtracted back.
        // User typed what they want to see on the front screen.
        // Front screen shows: currentBalance - spent
        // So to make front screen show newBalance: currentBalance = newBalance + spent
        const newDisplayBalance = s.currentBalance;
        const trueBase = parseFloat((newDisplayBalance + spent).toFixed(2));
        const newLocked = calcDailyBudget(newDisplayBalance, bills, np);
        setLockedDailyBudget(newLocked);
        setBalanceAdjustedToday(true); // flag so streak doesn't extend today
        setSetup(prev=>({...prev,...s,currentBalance:trueBase,nextPayday:np}));
      }}/>
      <HistorySheet open={showHistory} onClose={()=>setShowHistory(false)} history={history} sym={sym} streak={streak} totalWins={totalWins} streakHistory={streakHistory} potHistoryLog={potHistoryLog} onEditDay={setEditingDay}/>
      {editingDay&&(
        <DayEditSheet day={history.find(h=>h.date===editingDay)} sym={sym}
          onClose={()=>setEditingDay(null)}
          onSave={entries=>{ editPastDay(editingDay, entries); setEditingDay(null); }}/>
      )}
      <UpdateBalanceSheet
        open={showUpdateBalance}
        onClose={()=>setShowUpdateBalance(false)}
        sym={sym}
        currentBalance={setup.currentBalance}
        onUpdate={v=>{
          const trueBase = parseFloat((v + (appMode==="pro"?spent:0)).toFixed(2));
          setSetup(prev=>({...prev,currentBalance:trueBase}));
          const newLocked = parseFloat((v/Math.max(days,1)).toFixed(2));
          setLockedDailyBudget(newLocked);
          // Log balance update for chart
          const today = todayISO();
          setBalanceLog(prev=>{
            const filtered = prev.filter(e=>e.date!==today);
            return [...filtered,{date:today,balance:v}].slice(-7);
          });
        }}
      />
      {showFaqMain&&(
        <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={()=>setShowFaqMain(false)}/>
          <div style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",maxHeight:"88vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"}}>
            <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
              <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.3)"}}/>
            </div>
            <div style={{padding:"0 24px 8px"}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff",marginBottom:"16px"}}>How Day Pay Works</div>
              <FaqList/>
            </div>
          </div>
        </div>
      )}
      <CreditCardSheet open={showCreditCards} onClose={()=>setShowCreditCards(false)} creditCards={creditCards} sym={sym}
        onAdd={c=>setCreditCards(prev=>[...prev,c])}
        onDelete={id=>setCreditCards(prev=>prev.filter(c=>c.id!==id))}
        onUpdate={(id,bal)=>setCreditCards(prev=>prev.map(c=>c.id===id?{...c,balance:bal}:c))}
      />
      <RecurringSheet open={showBills} onClose={()=>setShowBills(false)} bills={bills} sym={sym} accounts={[]}
        onAdd={b=>updateBills([...bills,b])}
        onDelete={id=>updateBills(bills.filter(b=>b.id!==id))}

      />



      {/* ── TOP BAR ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",letterSpacing:"-0.3px",lineHeight:1}}>Day Pay</div>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",marginTop:"4px",letterSpacing:"0.2px",lineHeight:1.4,maxWidth:"200px"}}>Budgeting that makes every day, Pay Day</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"2px"}}>
          {appMode==="pro"&&streak>0&&<div style={{background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:"50px",padding:"4px 10px",fontSize:"12px",color:"#FBBF24"}}>🔥 {streak}</div>}
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>
            {new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{display:"flex",gap:"6px",background:"rgba(0,0,0,0.2)",borderRadius:"12px",padding:"3px",marginBottom:"12px"}}>
        <button onClick={()=>setAppMode("calculator")} style={{flex:1,padding:"7px",borderRadius:"9px",border:"none",background:appMode==="calculator"?"rgba(255,255,255,0.08)":"transparent",color:appMode==="calculator"?"#fff":"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"12px",cursor:"pointer"}}>
          🧮 Calculator
        </button>
        <button onClick={()=>setAppMode("pro")} style={{flex:1,padding:"7px",borderRadius:"9px",border:"none",background:appMode==="pro"?"rgba(255,255,255,0.08)":"transparent",color:appMode==="pro"?"#fff":"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"12px",cursor:"pointer"}}>
          ⭐ Pro
        </button>
      </div>

      {/* ── BUDGET CARD ── */}
      <div style={{background:"linear-gradient(135deg,rgba(52,211,153,0.08),rgba(255,255,255,0.02))",border:"1px solid rgba(52,211,153,0.15)",borderRadius:"24px",padding:"16px",marginBottom:"10px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:"3px"}}>
          <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${barCol}88,${barCol})`,transition:"width 0.4s ease"}}/>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
          <div>
            {/* Daily budget label with tooltip */}
            <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"3px"}}>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase"}}>Daily Budget</div>
              <div style={{position:"relative"}}>
                <div
                  onClick={()=>setShowBudgetTip(v=>!v)}
                  style={{width:"14px",height:"14px",borderRadius:"50%",background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",color:"#A78BFA",cursor:"pointer",flexShrink:0}}
                >?</div>

              </div>
            </div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"38px",fontWeight:"700",color:"#34D399",lineHeight:1}}>
              {sym}{daily.toFixed(2)}
            </div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.25)",marginTop:"4px"}}>
              {sym}{Math.max(0,currentBalance-spent).toFixed(2)} left · payday {shortDate(payday)}{todayIncome>0&&<span style={{color:"#34D399",marginLeft:"6px"}}>+{sym}{todayIncome.toFixed(2)} in</span>}
            </div>
            {reservedBills>0&&(
              <div style={{fontSize:"11px",color:"#FBBF24",marginTop:"2px",opacity:0.8}}>
                🔒 {sym}{reservedBills.toFixed(2)} reserved for bills before payday
              </div>
            )}

          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"3px"}}>{isUnder?"Left":"Over"}</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"30px",fontWeight:"700",color:isUnder?"#fff":"#F87171",lineHeight:1}}>
              {sym}{Math.abs(remain).toFixed(2)}
            </div>
            <div style={{fontSize:"11px",color:barCol,marginTop:"4px",fontWeight:"600"}}>{pct.toFixed(0)}% used</div>
          </div>
        </div>

        {/* Budget tip */}
        {showBudgetTip&&(
          <div style={{background:"rgba(12,12,28,0.95)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:"14px",padding:"14px",marginBottom:"8px",animation:"slideUp 0.2s ease"}} onClick={()=>setShowBudgetTip(false)}>
            <div style={{fontSize:"11px",color:"#A78BFA",fontWeight:"600",marginBottom:"5px"}}>💡 How is this calculated?</div>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.65)",lineHeight:1.7}}>
              Your daily budget is your <strong style={{color:"#fff"}}>current balance, minus bills due before payday, ÷ days until payday</strong> — not including payday itself. Bills are set aside in advance so the number is only money you can actually spend. Tap anywhere to close.
            </div>
          </div>
        )}

        {/* Credit card balances */}
        {creditCards.length>0&&(
          <div style={{marginBottom:"8px",paddingBottom:"8px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            {creditCards.map(card=>(
              <div key={card.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",display:"flex",alignItems:"center",gap:"5px"}}>
                  <span>💳</span><span>{card.name}</span>
                </div>
                <div style={{fontSize:"13px",fontWeight:"700",color:"#F87171"}}>
                  Owed {sym}{card.balance.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        {appMode==="pro"&&expenses.length>0&&(
          <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:'4px',paddingTop:'8px'}}>
            <button onClick={()=>setShowTransactions(v=>!v)} style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',background:'none',border:'none',cursor:'pointer',paddingBottom:'4px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <span style={{fontSize:'11px',color:'rgba(255,255,255,0.4)',letterSpacing:'1.5px',textTransform:'uppercase'}}>Transactions</span>
                <span style={{background:'rgba(255,255,255,0.08)',borderRadius:'20px',padding:'2px 8px',fontSize:'11px',color:'rgba(255,255,255,0.45)',fontWeight:'600'}}>{expenses.filter(e=>!e.isIncome||(e.isIncome&&!e.isCreditPayoff)||e.isAutoBalancer).length}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <span style={{fontSize:'12px',color:'#F87171',fontWeight:'700'}}>-{sym}{effectiveSpent.toFixed(2)}</span>
                <span style={{color:'rgba(255,255,255,0.3)',fontSize:'13px',display:'inline-block',transform:showTransactions?'rotate(180deg)':'rotate(0deg)',transition:'transform 0.2s'}}>{showTransactions ? '-' : '+'}</span>
              </div>
            </button>
          </div>
        )}
        {expenses.length>0&&showTransactions&&(()=>{
          const mainExpenses   = expenses.filter(e=>!e.isIncome&&!e.isCreditCard&&!e.account);
          const accountExpenses= expenses.filter(e=>!e.isIncome&&!e.isCreditCard&&e.account);
          const creditCharges  = expenses.filter(e=>e.isCreditCard);
          const incomeItems    = expenses.filter(e=>e.isIncome);

          // Undo exactly what logging the entry did
          const findCard = (id, name) => creditCards.find(c=>c.id===id) ?? creditCards.find(c=>c.name===name);
          const deletePill = (e) => {
            if(e.isAutoBalancer || e.isCreditPayoff){
              // A card payment is two linked entries (the payment + its balance deduction) — undo both
              const isPair = (x) => e.pairId ? x.pairId===e.pairId
                : (x.amount===e.amount && (x.account===e.linkedCreditCard || x.linkedCreditCard===e.account));
              const payment  = e.isCreditPayoff ? e : expenses.find(x=>x.isCreditPayoff && isPair(x));
              const balancer = e.isAutoBalancer ? e : expenses.find(x=>x.isAutoBalancer && isPair(x));
              if(balancer) setSetup(prev=>({...prev,currentBalance:prev.currentBalance+balancer.amount}));
              const c = findCard(payment?.destination ?? balancer?.cardId, payment?.account ?? balancer?.linkedCreditCard);
              if(c) setCreditCards(prev=>prev.map(x=>x.id===c.id?{...x,balance:x.balance+e.amount}:x));
              const ids = [payment?.id, balancer?.id].filter(v=>v!=null);
              setExpenses(p=>p.filter(x=>!ids.includes(x.id)));
              return;
            }
            if(e.isIncome){
              // Income to main was added to the balance when logged
              setSetup(prev=>({...prev,currentBalance:prev.currentBalance-e.amount}));
            } else if(e.isCreditCard){
              // Card purchase increased what's owed on the card
              const c = findCard(e.cardId, e.account);
              if(c) setCreditCards(prev=>prev.map(x=>x.id===c.id?{...x,balance:Math.max(0,x.balance-e.amount)}:x));
            }
            // Regular expenses: nothing to undo — balance is only deducted at day close
            setExpenses(p=>p.filter(x=>x.id!==e.id));
          };

          const Pill = ({e}) => {
            const isCreditRelated = e.isCreditCard || e.isCreditPayoff;
            return (
              <div style={{
                display:"flex",alignItems:"center",gap:"6px",
                padding:"5px 10px 5px 8px",borderRadius:"50px",fontSize:"12px",
                background:e.isIncome?"rgba(52,211,153,0.1)":e.isCreditCard?"rgba(167,139,250,0.07)":"rgba(248,113,113,0.07)",
                border:`1px solid ${e.isIncome?"rgba(52,211,153,0.25)":e.isCreditCard?"rgba(167,139,250,0.2)":"rgba(248,113,113,0.2)"}`,
                color:"rgba(255,255,255,0.85)"
              }}>
                {isCreditRelated && <span style={{fontSize:"13px"}}>💳</span>}
                <span>{e.label}</span>
                <span style={{fontWeight:"700",color:e.isIncome?"#34D399":e.isCreditCard?"#A78BFA":"#F87171"}}>
                  {e.isIncome?"+":`-`}{sym}{e.amount.toFixed(2)}
                </span>
                <button onClick={()=>deletePill(e)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",cursor:"pointer",padding:"0",fontSize:"13px",lineHeight:1}}>×</button>
              </div>
            );
          };

          const Section = ({label, icon, items, color}) => items.length===0?null:(
            <div style={{marginBottom:"8px"}}>
              <div style={{fontSize:"10px",color:color||"rgba(255,255,255,0.3)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"5px",display:"flex",alignItems:"center",gap:"4px"}}>
                <span>{icon}</span><span>{label}</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                {items.map(e=><Pill key={e.id} e={e}/>)}
              </div>
            </div>
          );

          return (
            <div style={{paddingTop:"10px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
              <Section label="Expenses"      icon="−" items={mainExpenses}    color="rgba(248,113,113,0.6)"/>
              <Section label="Other Accounts" icon="🏦" items={accountExpenses} color="rgba(167,139,250,0.6)"/>
              <Section label="Credit Card"   icon="💳" items={creditCharges}  color="rgba(167,139,250,0.6)"/>
              <Section label="Income"        icon="+" items={incomeItems}     color="rgba(52,211,153,0.7)"/>

            </div>
          );
        })()}
      </div>

      {/* ── CALCULATOR MODE ── */}
      {appMode==="calculator"&&(
        <>
          <button onClick={()=>setShowUpdateBalance(true)} style={{width:"100%",padding:"18px",marginBottom:"12px",background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:"20px",color:"#34D399",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"15px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
            <span style={{fontSize:"20px"}}>✎</span> Update balance
          </button>

          {/* 7-day balance chart */}
          {balanceLog.length>0&&(()=>{
            const logs = balanceLog.slice(-7);
            const maxB = Math.max(...logs.map(l=>l.balance));
            const minB = Math.min(...logs.map(l=>l.balance));
            const range = maxB - minB || 1;
            return (
              <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"20px",padding:"16px",marginBottom:"10px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase"}}>Balance history</div>
                    <div style={{position:"relative",display:"inline-block"}} onClick={e=>{e.stopPropagation();const t=e.currentTarget.querySelector('.chart-tip');t.style.display=t.style.display==='block'?'none':'block';}}>
                      <div style={{width:"14px",height:"14px",borderRadius:"50%",background:"rgba(167,139,250,0.2)",border:"1px solid rgba(167,139,250,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",color:"#A78BFA",cursor:"pointer",fontWeight:"700"}}>?</div>
                      <div className="chart-tip" style={{display:"none",position:"absolute",top:"20px",left:0,background:"rgba(12,12,28,0.98)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:"12px",padding:"10px 12px",width:"220px",zIndex:50,fontSize:"11px",color:"rgba(255,255,255,0.6)",lineHeight:1.7}}>
                        Each bar shows your balance on that day. <span style={{color:"#34D399"}}>Green</span> means your balance held steady or went up. <span style={{color:"#F87171"}}>Red</span> means it dropped. The brightest bar is today. Tap to close.
                      </div>
                    </div>
                  </div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>7 days</div>
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:"6px",height:"80px",justifyContent:"space-around"}}>
                  {logs.map((l,i)=>{
                    const heightPct = range===0?60:20+((l.balance-minB)/range)*60;
                    const isLatest = i===logs.length-1;
                    const trend = i>0 ? l.balance >= logs[i-1].balance : true;
                    return (
                      <div key={l.date} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"4px",flex:1}}>
                        <div style={{fontSize:"9px",color:isLatest?"#34D399":"rgba(255,255,255,0.3)",fontWeight:isLatest?"700":"400"}}>{sym}{(l.balance/1000).toFixed(1)}k</div>
                        <div style={{
                          width:"100%",maxWidth:"36px",
                          height:`${heightPct}px`,
                          background:isLatest?"#34D399":trend?"rgba(52,211,153,0.4)":"rgba(248,113,113,0.4)",
                          borderRadius:"6px 6px 3px 3px",
                          transition:"height 0.5s ease"
                        }}/>
                        <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)"}}>{shortDate(l.date)}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:"10px",paddingTop:"10px",borderTop:"1px solid rgba(255,255,255,0.05)"}}>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>7 days ago: <span style={{color:"#fff"}}>{sym}{balanceLog[0]?.balance.toFixed(2)}</span></div>
                  <div style={{fontSize:"11px",color:(balanceLog[balanceLog.length-1]?.balance||0)>=(balanceLog[0]?.balance||0)?"#34D399":"#F87171",fontWeight:"600"}}>
                    {(balanceLog[balanceLog.length-1]?.balance||0)>=(balanceLog[0]?.balance||0)?"↑":"↓"} {sym}{Math.abs((balanceLog[balanceLog.length-1]?.balance||0)-(balanceLog[0]?.balance||0)).toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── ADD EXPENSE BUTTON (full mode only) ── */}
      {appMode==="pro"&&!showCalc&&(
        <>
          <button onClick={()=>setShowCalc(true)} style={{width:"100%",padding:"18px",marginBottom:"10px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"20px",color:"rgba(255,255,255,0.5)",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"15px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
            <span style={{fontSize:"20px"}}>⊕</span> Add Expense or Income
          </button>

          {/* Streak + Savings Pot — full mode only */}
          {appMode==="pro"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"10px"}}>
            <div style={{background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.15)",borderRadius:"20px",padding:"16px"}}>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>Streak</div>
              <div style={{fontSize:"38px",fontWeight:"700",color:streak>0?"#FBBF24":"rgba(255,255,255,0.2)",fontFamily:"'Cormorant Garamond',serif",lineHeight:1,marginBottom:"4px"}}>{streak}</div>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)"}}>{streak===1?"day":"days"} under budget</div>

              {balanceAdjustedToday&&(
                <div style={{fontSize:"10px",color:"rgba(251,191,36,0.5)",marginTop:"6px",lineHeight:1.6}}>
                  Balance updated today<br/>Streak paused · No savings added
                </div>
              )}
            </div>
            <div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.15)",borderRadius:"20px",padding:"16px"}}>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>Savings Pot</div>
              <div style={{fontSize:"26px",fontWeight:"700",color:"#34D399",fontFamily:"'Cormorant Garamond',serif",lineHeight:1,marginBottom:"6px"}}>{sym}{savingsPot.toFixed(2)}</div>
              <div style={{background:"rgba(255,255,255,0.08)",borderRadius:"4px",height:"4px",overflow:"hidden",marginBottom:"4px"}}>
                <div style={{height:"100%",width:`${Math.min(potGoal>0?(savingsPot/potGoal)*100:0,100)}%`,background:"#34D399",borderRadius:"4px"}}/>
              </div>
              {editingPotGoal ? (
                <div style={{display:"flex",gap:"6px",alignItems:"center",marginTop:"2px"}}>
                  <input type="number" defaultValue={potGoal} autoFocus
                    onBlur={e=>{const v=parseFloat(e.target.value);if(v>0)setPotGoal(v);setEditingPotGoal(false);}}
                    onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(e.target.value);if(v>0)setPotGoal(v);setEditingPotGoal(false);}}}
                    style={{width:"80px",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(52,211,153,0.4)",borderRadius:"8px",padding:"4px 8px",color:"#34D399",fontFamily:"'DM Sans',sans-serif",fontSize:"12px",outline:"none"}}/>
                  <span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>goal</span>
                </div>
              ) : (
                <div onClick={()=>setEditingPotGoal(true)} style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px",marginTop:"2px"}}>
                  <span>{sym}{potGoal} goal</span>
                  <span style={{background:"rgba(52,211,153,0.15)",border:"1px solid rgba(52,211,153,0.3)",borderRadius:"6px",padding:"1px 6px",color:"#34D399",fontSize:"10px",fontWeight:"600"}}>Edit</span>
                </div>
              )}
            </div>
          </div>}

        </>
      )}

      {/* ── CALCULATOR ── */}
      {showCalc&&(
        <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${isIncome?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.07)"}`,borderRadius:"20px",padding:"12px",marginBottom:"8px",animation:"slideUp 0.25s ease"}}>
          {/* Income / Expense toggle */}
          <div style={{display:"flex",gap:"6px",marginBottom:"8px",background:"rgba(0,0,0,0.2)",borderRadius:"12px",padding:"4px"}}>
            <button onClick={()=>setIsIncome(false)} style={{flex:1,padding:"8px",borderRadius:"8px",border:"none",background:!isIncome?"rgba(248,113,113,0.2)":"transparent",color:!isIncome?"#F87171":"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"13px",cursor:"pointer",transition:"all 0.2s"}}>
              − Expense
            </button>
            <button onClick={()=>setIsIncome(true)} style={{flex:1,padding:"8px",borderRadius:"8px",border:"none",background:isIncome?"rgba(52,211,153,0.2)":"transparent",color:isIncome?"#34D399":"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"13px",cursor:"pointer",transition:"all 0.2s"}}>
              + Income
            </button>
          </div>
          {/* Amount display */}
          <div style={{display:"flex",gap:"8px",marginBottom:"8px",alignItems:"center"}}>
            <div style={{flex:1,background:"rgba(0,0,0,0.3)",borderRadius:"12px",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"32px",fontWeight:"700",color:display==="0"?"rgba(255,255,255,0.2)":isIncome?"#34D399":"#fff",letterSpacing:"-0.5px",lineHeight:1}}>
                {isIncome?"+":""}{sym}{display}
              </div>
              <button onClick={()=>{setShowCalc(false);setDisplay("0");setLabel("");setIsIncome(false);setIncomeDestination("main");setIncomeDeductBalance(true);}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:"20px",cursor:"pointer",lineHeight:1,flexShrink:0}}>×</button>
            </div>
          </div>
          {/* Label row */}
          <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
            <input ref={labelRef} placeholder="Label (optional)" value={label} onChange={e=>setLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddExpense()}
              style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",padding:"9px 12px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"13px",outline:"none"}}/>
            {!isIncome&&creditCards.length>0&&(
              <select value={incomeDestination==="main"?"":incomeDestination} onChange={e=>setIncomeDestination(e.target.value||"main")}
                style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"10px",padding:"9px 10px",color:"rgba(255,255,255,0.7)",fontFamily:"'DM Sans',sans-serif",fontSize:"12px",outline:"none",colorScheme:"dark",maxWidth:"120px"}}>
                <option value="">Main</option>
                {creditCards.map(c=><option key={c.id} value={c.id}>💳 {c.name}</option>)}
              </select>
            )}
          </div>
          {/* Income destination — only shown when in income mode */}
          {isIncome&&(()=>{
            // Non-credit accounts only (can't "receive" money into a credit card, that's a payment)
            // Destinations: main budget + credit card payoffs
            const destinations = [
              {id:"main", label:"Main Budget", icon:"💰"},
              ...creditCards.flatMap(c=>[
                {id:c.id, label:`Pay ${c.name}`, icon:"💳", creditPayoff:true, deductBalance:true},
                {id:`${c.id}_noDeduct`, label:`Pay ${c.name} (no deduct)`, icon:"💳", creditPayoff:true, deductBalance:false, realAccId:c.id},
              ]),
            ];
            if(destinations.length<=1) return null;
            return (
              <div style={{marginBottom:"8px"}}>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>Add income to</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                  {destinations.map(d=>(
                    <button key={d.id} onClick={()=>{
                    const realId = d.realAccId || d.id;
                    setIncomeDestination(realId);
                    setIncomeDeductBalance(d.deductBalance!==false);
                  }} style={{
                      padding:"6px 12px",borderRadius:"20px",border:"none",
                      background:(incomeDestination===(d.realAccId||d.id)&&incomeDeductBalance===( d.deductBalance!==false))?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.05)",
                      border:`1px solid ${(incomeDestination===(d.realAccId||d.id)&&incomeDeductBalance===(d.deductBalance!==false))?"rgba(52,211,153,0.5)":"rgba(255,255,255,0.08)"}`,
                      color:(incomeDestination===(d.realAccId||d.id)&&incomeDeductBalance===(d.deductBalance!==false))?"#34D399":"rgba(255,255,255,0.45)",
                      fontFamily:"'DM Sans',sans-serif",fontSize:"12px",fontWeight:"600",cursor:"pointer",
                      display:"flex",alignItems:"center",gap:"5px"
                    }}>
                      <span>{d.icon}</span><span>{d.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* Compact numpad */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px",marginBottom:"8px"}}>
            {["7","8","9","4","5","6","1","2","3",".","0","⌫"].map(k=>(
              <button key={k} onClick={()=>handleNumKey(k)} style={{
                padding:"14px 0",borderRadius:"12px",border:"none",
                background:k==="⌫"?"rgba(248,113,113,0.1)":"rgba(255,255,255,0.06)",
                color:k==="⌫"?"#F87171":"rgba(255,255,255,0.85)",
                fontSize:"19px",fontWeight:"600",fontFamily:"'DM Sans',sans-serif",cursor:"pointer"
              }}>{k}</button>
            ))}
          </div>
          <button onClick={handleAddExpense} style={{width:"100%",padding:"13px",
            background:display!=="0"?(isIncome?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)"):"rgba(255,255,255,0.04)",
            border:display!=="0"?(isIncome?"1px solid rgba(52,211,153,0.3)":"1px solid rgba(248,113,113,0.25)"):"1px solid rgba(255,255,255,0.07)",
            borderRadius:"12px",
            color:display!=="0"?(isIncome?"#34D399":"#F87171"):"rgba(255,255,255,0.2)",
            fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"15px",cursor:display!=="0"?"pointer":"default"}}>
            {display!=="0"?(isIncome?`+ Income ${sym}${display}`:`− ${sym}${display}`):"Enter amount"}
          </button>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      {appMode==="calculator"&&(
        <div style={{
          position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
          width:"100%",maxWidth:"420px",
          background:"rgba(8,15,18,0.95)",
          backdropFilter:"blur(20px)",
          borderTop:"1px solid rgba(255,255,255,0.07)",
          display:"flex",justifyContent:"space-around",alignItems:"center",
          padding:"10px 0 24px",zIndex:100
        }}>
          <button onClick={()=>setShowFaqMain(true)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px",padding:"6px 12px",borderRadius:"12px"}}>
            <span style={{fontSize:"20px"}}>❓</span>
            <span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",fontFamily:"'DM Sans',sans-serif",fontWeight:"500",letterSpacing:"0.3px"}}>FAQ</span>
          </button>
          <button onClick={()=>setShowSettings(true)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px",padding:"6px 12px",borderRadius:"12px"}}>
            <span style={{fontSize:"20px"}}>⚙️</span>
            <span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",fontFamily:"'DM Sans',sans-serif",fontWeight:"500",letterSpacing:"0.3px"}}>Settings</span>
          </button>
        </div>
      )}
      {appMode==="pro"&&<div style={{
        position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:"420px",
        background:"rgba(8,15,18,0.95)",
        backdropFilter:"blur(20px)",
        borderTop:"1px solid rgba(255,255,255,0.07)",
        display:"flex",justifyContent:"space-around",alignItems:"center",
        padding:"10px 0 24px",zIndex:100
      }}>
        {[
          {icon:"📊", label:"History",  action:()=>setShowHistory(true)},
          {icon:"💳", label:"Cards",    action:()=>setShowCreditCards(true)},
          {icon:"🔄", label:"Bills",    action:()=>setShowBills(true), badge:upcomingBillsCount},
          {icon:"❓", label:"FAQ",      action:()=>setShowFaqMain(true)},
          {icon:"⚙️", label:"Settings", action:()=>setShowSettings(true)},
        ].map(item=>(
          <button key={item.label} onClick={item.action} style={{
            background:"none",border:"none",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:"4px",
            padding:"6px 12px",borderRadius:"12px",
            transition:"all 0.15s",position:"relative"
          }}>
            <span style={{fontSize:"20px",position:"relative"}}>
              {item.icon}
              {item.badge>0&&(
                <span style={{
                  position:"absolute",top:"-4px",right:"-6px",
                  background:"#F87171",borderRadius:"50%",
                  width:"16px",height:"16px",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:"9px",fontWeight:"700",color:"#fff",lineHeight:1
                }}>{item.badge}</span>
              )}
            </span>
            <span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",fontFamily:"'DM Sans',sans-serif",fontWeight:"500",letterSpacing:"0.3px"}}>{item.label}</span>
          </button>
        ))}
      </div>}
      <div style={{height:appMode==="pro"?"80px":"20px"}}/>
    </div>
  );
}
