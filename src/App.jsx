import { useState, useEffect, useRef } from "react";

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

// ─── Pay Schedule Options ─────────────────────────────────────────────────────
const PAY_SCHEDULES = [
  { id:"every_friday",    label:"Every Friday",          icon:"📅" },
  { id:"every_2_weeks",   label:"Every Other Friday",     icon:"🗓️" },
  { id:"last_working_day",label:"Last working day of the Month", icon:"🏦" },
  { id:"custom",          label:"Custom date",           icon:"✏️" },
];

// ─── Date Helpers ─────────────────────────────────────────────────────────────
function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function todayISO() { return toISO(new Date()); }

function getLastWorkingDay(year, month) {
  let d = new Date(year, month + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

// Next payday ISO based on schedule
function getNextPayday(schedule, customDate) {
  const today = new Date(); today.setHours(0,0,0,0);

  if (schedule === "every_friday") {
    let d = new Date(today);
    const dow = d.getDay(); // 0=Sun,5=Fri
    const daysUntilFri = dow <= 5 ? 5 - dow : 6; // days until next Friday
    d.setDate(d.getDate() + (daysUntilFri === 0 ? 7 : daysUntilFri));
    return toISO(d);
  }

  if (schedule === "every_2_weeks") {
    // If user has set an anchor payday date, step forward in 14-day increments from that anchor
    if (customDate) {
      let anchor = new Date(customDate+"T00:00:00");
      while (anchor <= today) anchor.setDate(anchor.getDate() + 14);
      return toISO(anchor);
    }
    // No anchor - find the next Friday, then add 7 more days to make it every OTHER Friday
    let d = new Date(today);
    const dow = d.getDay();
    const daysToFri = (dow <= 5) ? (5 - dow) : 6;
    d.setDate(d.getDate() + (daysToFri === 0 ? 7 : daysToFri) + 7);
    return toISO(d);
  }

  if (schedule === "last_working_day") {
    let payday = getLastWorkingDay(today.getFullYear(), today.getMonth());
    if (today >= payday) {
      // Move to next month
      payday = getLastWorkingDay(
        today.getMonth() === 11 ? today.getFullYear()+1 : today.getFullYear(),
        today.getMonth() === 11 ? 0 : today.getMonth()+1
      );
    }
    return toISO(payday);
  }

  if (schedule === "custom" && customDate) {
    let d = new Date(customDate+"T00:00:00");
    if (d <= today) {
      // Move forward by a month for custom
      d.setMonth(d.getMonth()+1);
    }
    return toISO(d);
  }

  // fallback
  let d = new Date(today); d.setDate(d.getDate() + 30);
  return toISO(d);
}

// Days from today UNTIL payday, NOT including payday itself
// e.g. if payday is in 5 days, we get 5 spending days (today + 4 more)
function daysUntilPayday(paydayISO) {
  const today = new Date(); today.setHours(0,0,0,0);
  const payday = new Date(paydayISO+"T00:00:00"); payday.setHours(0,0,0,0);
  const diff = Math.ceil((payday - today) / 86400000);
  return Math.max(diff, 1); // days of spending = days before payday
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
const TROPHIES = [
  { id:"first_win",    icon:"🥉", name:"First Win",          desc:"Stay under budget for the first time",   condition:s=>s.totalWins>=1 },
  { id:"three_streak", icon:"🔥", name:"On Fire",            desc:"3-day streak under budget",              condition:s=>s.streak>=3 },
  { id:"seven_streak", icon:"⚡", name:"Lightning Saver",    desc:"7-day streak under budget",              condition:s=>s.streak>=7 },
  { id:"half_budget",  icon:"🎯", name:"Sharp Shooter",      desc:"Spend less than half your daily budget", condition:s=>s.lastRatio<=0.5&&s.totalWins>=1 },
  { id:"perfect_ten",  icon:"💎", name:"Diamond Discipline", desc:"10 total days under budget",             condition:s=>s.totalWins>=10 },
  { id:"big_saver",    icon:"🏆", name:"Big Saver",          desc:"Save over 20 in a single day",           condition:s=>s.lastSaving>=20 },
];

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti({ active }) {
  if (!active) return null;
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:200,overflow:"hidden"}}>
      {Array.from({length:32}).map((_,i)=>(
        <div key={i} style={{
          position:"absolute",left:`${Math.random()*100}%`,top:"-10px",
          width:`${5+Math.random()*6}px`,height:`${8+Math.random()*8}px`,
          background:["#FFD700","#FF6B6B","#4ECDC4","#A78BFA","#34D399","#F472B6"][i%6],
          borderRadius:"2px",
          animation:`fall ${1.5+Math.random()*2}s ease-in forwards`,
          animationDelay:`${Math.random()*0.8}s`,
          transform:`rotate(${Math.random()*360}deg)`,
        }}/>
      ))}
    </div>
  );
}

// ─── Trophy Toast ─────────────────────────────────────────────────────────────
function TrophyToast({ trophy, onClose }) {
  useEffect(()=>{
    if(trophy){ const t=setTimeout(onClose,3500); return ()=>clearTimeout(t); }
  },[trophy]);
  if(!trophy) return null;
  return (
    <div style={{
      position:"fixed",bottom:"24px",left:"50%",transform:"translateX(-50%)",
      background:"linear-gradient(135deg,#1c1c3a,#0f1629)",
      border:"1px solid rgba(255,215,0,0.4)",borderRadius:"20px",
      padding:"14px 20px",display:"flex",alignItems:"center",gap:"12px",
      zIndex:300,boxShadow:"0 8px 40px rgba(255,215,0,0.15),0 4px 20px rgba(0,0,0,0.5)",
      animation:"slideToast 0.4s cubic-bezier(0.34,1.56,0.64,1)",
      maxWidth:"340px",width:"calc(100vw - 48px)"
    }}>
      <span style={{fontSize:"32px",filter:"drop-shadow(0 0 10px rgba(255,215,0,0.6))"}}>{trophy.icon}</span>
      <div>
        <div style={{fontSize:"10px",color:"#FFD700",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"2px"}}>Trophy Unlocked</div>
        <div style={{color:"#fff",fontWeight:"700",fontSize:"15px"}}>{trophy.name}</div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:"12px"}}>{trophy.desc}</div>
      </div>
      <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:"18px",cursor:"pointer",padding:"0 4px",flexShrink:0}}>×</button>
    </div>
  );
}

// ─── NumPad ───────────────────────────────────────────────────────────────────
function NumPad({ onKey }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
      {["7","8","9","4","5","6","1","2","3","⌫","0","."].map(k=>(
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

// ─── History Sheet ────────────────────────────────────────────────────────────
function HistorySheet({ open, onClose, history, sym, streak, totalWins }) {
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
      <div style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",maxHeight:"85vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff"}}>History</div>
            <div style={{display:"flex",gap:"12px"}}>
              {streak>0&&<div style={{fontSize:"13px",color:"#FBBF24"}}>🔥 {streak}</div>}
              <div style={{fontSize:"13px",color:"#34D399"}}>✓ {totalWins} days</div>
            </div>
          </div>
          {history.length===0 ? (
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
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                          <span style={{fontSize:"16px"}}>{h.under?"✅":"❌"}</span>
                          <div>
                            <div style={{fontWeight:"600",fontSize:"14px",color:"#fff"}}>{shortDate(h.date)}</div>
                            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Budget {sym}{h.budget.toFixed(2)}</div>
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
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Trophies Sheet ───────────────────────────────────────────────────────────
function TrophiesSheet({ open, onClose, unlocked, allTimeTrophies }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",maxHeight:"85vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff"}}>Trophies</div>
            <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>{unlocked.length}/{TROPHIES.length} this period</div>
          </div>
          {allTimeTrophies>0&&<div style={{fontSize:"12px",color:"#FFD700",marginBottom:"20px"}}>🏅 {allTimeTrophies} earned all time</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"16px"}}>
            {TROPHIES.map(t=>{
              const got=unlocked.includes(t.id);
              return (
                <div key={t.id} style={{background:got?"rgba(255,215,0,0.07)":"rgba(255,255,255,0.025)",border:`1px solid ${got?"rgba(255,215,0,0.2)":"rgba(255,255,255,0.06)"}`,borderRadius:"18px",padding:"18px 12px",textAlign:"center",filter:got?"none":"grayscale(1) opacity(0.3)"}}>
                  <div style={{fontSize:"36px",marginBottom:"8px"}}>{t.icon}</div>
                  <div style={{fontWeight:"700",fontSize:"13px",color:"#fff",marginBottom:"4px"}}>{t.name}</div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,0.38)",lineHeight:1.4}}>{t.desc}</div>
                  {got&&<div style={{marginTop:"6px",fontSize:"10px",color:"#FFD700",letterSpacing:"1px"}}>✓ UNLOCKED</div>}
                </div>
              );
            })}
          </div>
          <div style={{background:"rgba(167,139,250,0.05)",border:"1px dashed rgba(167,139,250,0.18)",borderRadius:"14px",padding:"16px",textAlign:"center"}}>
            <div style={{fontSize:"20px",marginBottom:"6px"}}>🎟️</div>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",lineHeight:1.6}}>
              <span style={{color:"#A78BFA",fontWeight:"600"}}>Sponsor coupon codes</span><br/>coming soon
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Sheet ───────────────────────────────────────────────────────────
function SettingsSheet({ open, onClose, setup, onSave }) {
  const [balance,   setBalance]   = useState(String(setup.currentBalance));
  const [salary,    setSalary]    = useState(String(setup.monthlySalary));
  const [currency,  setCurrency]  = useState(setup.currency);
  const [schedule,  setSchedule]  = useState(setup.paySchedule||"last_working_day");
  const [customDate,setCustomDate]= useState(setup.customPayDate||"");
  const sym = CURRENCIES.find(c=>c.code===currency)?.symbol||"£";

  useEffect(()=>{
    if(open){
      setBalance(String(setup.currentBalance));
      setSalary(String(setup.monthlySalary));
      setCurrency(setup.currency);
      setSchedule(setup.paySchedule||"last_working_day");
      setCustomDate(setup.customPayDate||"");
    }
  },[open]);

  if(!open) return null;

  const nextPayday = getNextPayday(schedule, customDate||setup.customPayDate);
  const days = daysUntilPayday(nextPayday);
  const daily = days>0?(parseFloat(balance)||0)/days:0;

  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div style={{position:"relative",background:"linear-gradient(180deg,#111827,#0d1117)",borderRadius:"28px 28px 0 0",padding:"0 0 48px",maxHeight:"92vh",overflowY:"auto",animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)"}}/>
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"10px"}}>
              {PAY_SCHEDULES.map(s=>(
                <button key={s.id} onClick={()=>setSchedule(s.id)} style={{padding:"14px 12px",borderRadius:"14px",border:`1px solid ${schedule===s.id?"rgba(52,211,153,0.4)":"rgba(255,255,255,0.07)"}`,background:schedule===s.id?"rgba(52,211,153,0.12)":"rgba(255,255,255,0.04)",color:schedule===s.id?"#34D399":"rgba(255,255,255,0.45)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer",textAlign:"left"}}>
                  <div style={{fontSize:"18px",marginBottom:"4px"}}>{s.icon}</div>
                  <div style={{fontSize:"13px",fontWeight:"600"}}>{s.label}</div>
                </button>
              ))}
            </div>
            {schedule==="custom"&&(
              <input type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(167,139,250,0.25)",borderRadius:"12px",padding:"12px 16px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none",colorScheme:"dark",boxSizing:"border-box"}}/>
            )}
            {schedule==="every_2_weeks"&&(
              <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"6px"}}>Next payday: <span style={{color:"rgba(255,255,255,0.6)"}}>{longDate(nextPayday)}</span></div>
            )}
          </div>

          {/* Next payday info */}
          <div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.15)",borderRadius:"14px",padding:"14px 16px",marginBottom:"20px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px"}}>Next Payday</div>
            <div style={{fontSize:"15px",color:"#34D399",fontWeight:"600"}}>{longDate(nextPayday)}</div>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{days} spending days remaining</div>
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
            {daily>0&&<div style={{fontSize:"12px",color:"#34D399",marginTop:"6px",fontWeight:"600"}}>{sym}{daily.toFixed(2)} / day</div>}
          </div>

          <button onClick={()=>{
            const bal=parseFloat(balance)||0;
            const sal=parseFloat(salary)||0;
            if(bal>0) onSave({currentBalance:bal,monthlySalary:sal,currency,paySchedule:schedule,customPayDate:customDate});
            onClose();
          }} style={{width:"100%",padding:"16px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",border:"none",borderRadius:"16px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",cursor:"pointer",boxShadow:"0 6px 24px rgba(167,139,250,0.3)"}}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onComplete }) {
  const [step,       setStep]       = useState(0);
  const [currency,   setCurrency]   = useState("GBP");
  const [schedule,   setSchedule]   = useState("last_working_day");
  const [customDate, setCustomDate] = useState("");
  const [salInput,   setSalInput]   = useState("");
  const [balInput,   setBalInput]   = useState("");
  const [activeField,setActiveField]= useState("balance");

  const sym = CURRENCIES.find(c=>c.code===currency)?.symbol||"£";
  const nextPayday = getNextPayday(schedule, customDate);
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
            {PAY_SCHEDULES.map(s=>(
              <button key={s.id} onClick={()=>setSchedule(s.id)} style={{padding:"18px 14px",borderRadius:"18px",border:`1px solid ${schedule===s.id?"rgba(52,211,153,0.4)":"rgba(255,255,255,0.07)"}`,background:schedule===s.id?"rgba(52,211,153,0.12)":"rgba(255,255,255,0.04)",color:schedule===s.id?"#34D399":"rgba(255,255,255,0.45)",fontFamily:"'DM Sans',sans-serif",cursor:"pointer",textAlign:"left"}}>
                <div style={{fontSize:"24px",marginBottom:"6px"}}>{s.icon}</div>
                <div style={{fontSize:"14px",fontWeight:"700"}}>{s.label}</div>
              </button>
            ))}
          </div>
          {schedule==="custom"&&(
            <div style={{marginBottom:"14px"}}>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>Choose your payday date</div>
              <input type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:"14px",padding:"14px 16px",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:"15px",outline:"none",colorScheme:"dark",boxSizing:"border-box"}}/>
            </div>
          )}

          {/* Payday preview */}
          <div style={{background:"rgba(52,211,153,0.07)",border:"1px solid rgba(52,211,153,0.18)",borderRadius:"14px",padding:"14px 16px",marginBottom:"20px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px"}}>Next payday</div>
            <div style={{fontSize:"15px",color:"#34D399",fontWeight:"600"}}>{longDate(nextPayday)}</div>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{days} spending days remaining (payday not included)</div>
          </div>

          <div style={{display:"flex",gap:"10px"}}>
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
              if(balNum>0) onComplete({monthlySalary:salNum,currentBalance:balNum,currency,paySchedule:schedule,customPayDate:customDate,nextPayday});
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
  const [unlocked,        setUnlocked]        = useState(saved?.unlocked        ?? []);
  const [allTimeTrophies, setAllTimeTrophies] = useState(saved?.allTimeTrophies ?? 0);
  const [newTrophy,       setNewTrophy]       = useState(null);
  const [confetti,        setConfetti]        = useState(false);
  const [showCalc,        setShowCalc]        = useState(false);
  const [showSettings,    setShowSettings]    = useState(false);
  const [showHistory,     setShowHistory]     = useState(false);
  const [showTrophies,    setShowTrophies]    = useState(false);
  const [daySummary,      setDaySummary]      = useState(saved?.pendingSummary  ?? null);
  const [paydayModal,     setPaydayModal]     = useState(saved?.pendingPayday   ?? null);
  const [lastClosedDate,  setLastClosedDate]  = useState(saved?.lastClosedDate  ?? todayISO());
  const [showBudgetTip,   setShowBudgetTip]   = useState(false);
  const labelRef = useRef(null);

  // Persist everything
  useEffect(()=>{
    saveAll({setup,expenses,history,unlocked,allTimeTrophies,pendingSummary:daySummary,pendingPayday:paydayModal,lastClosedDate});
  },[setup,expenses,history,unlocked,allTimeTrophies,daySummary,paydayModal,lastClosedDate]);

  // On app open — check if day has changed
  useEffect(()=>{
    if(!setup) return;
    const today = todayISO();
    if(lastClosedDate && lastClosedDate !== today){
      runDayClose(lastClosedDate);
    }
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

  const runDayClose = (dateStr) => {
    const stored = loadAll();
    if(!stored?.setup) return;
    const s = stored.setup;
    const ex = stored.expenses ?? [];
    const nextPayday = s.nextPayday || getNextPayday(s.paySchedule, s.customPayDate);
    const days  = daysUntilPayday(nextPayday);
    const daily = days>0 ? s.currentBalance/days : s.currentBalance;
    const spent = ex.reduce((t,e)=>t+e.amount,0);
    const isUnder = spent < daily;

    const summary = {date:dateStr, spent, budget:daily, under:isUnder, expenses:ex};

    // Update history
    setHistory(prev=>[...prev,summary]);
    // Deduct spending from balance
    const newBalance = Math.max(0, s.currentBalance - spent);
    setExpenses([]);
    setDisplay("0");
    setLastClosedDate(todayISO());
    setDaySummary(summary);

    // Check if today is payday
    const todayStr = todayISO();
    if(isTodayPayday(nextPayday)){
      // Add income and show payday modal
      const suggested = newBalance + s.monthlySalary;
      const newNextPayday = getNextPayday(s.paySchedule, s.customPayDate);
      setSetup(prev=>({...prev,currentBalance:suggested,nextPayday:newNextPayday}));
      setPaydayModal({suggestedBalance:suggested});
      // Reset trophies
      setAllTimeTrophies(prev=>prev+unlocked.length);
      setUnlocked([]);
    } else {
      setSetup(prev=>({...prev,currentBalance:newBalance}));
    }

    // Trophy check
    const newStreak = isUnder ? (stored.history?.filter(h=>h.under).length>=0 ? (() => { let s2=0; const h=[...(stored.history??[]),summary]; for(let i=h.length-1;i>=0;i--){if(h[i].under)s2++;else break;} return s2; })() : 1) : 0;
    const newWins   = (stored.history??[]).filter(h=>h.under).length + (isUnder?1:0);
    checkTrophiesInner(stored.unlocked??[], {
      streak:newStreak, totalWins:newWins,
      lastSaving:Math.max(0,daily-spent),
      lastRatio:daily>0?spent/daily:1
    });
  };

  const checkTrophiesInner = (currentUnlocked, ns) => {
    TROPHIES.forEach(t=>{
      if(!currentUnlocked.includes(t.id)&&t.condition(ns)){
        setUnlocked(prev=>prev.includes(t.id)?prev:[...prev,t.id]);
        setNewTrophy(t);
        setConfetti(true);
        setTimeout(()=>setConfetti(false),3200);
      }
    });
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
        const np = s.nextPayday || getNextPayday(s.paySchedule, s.customPayDate);
        setSetup({...s, nextPayday:np});
        setLastClosedDate(todayISO());
      }}/>
    </>
  );

  const { currency, currentBalance, nextPayday: storedPayday, paySchedule, customPayDate, monthlySalary } = setup;
  const sym      = CURRENCIES.find(c=>c.code===currency)?.symbol||"£";
  const payday   = storedPayday || getNextPayday(paySchedule, customPayDate);
  const days     = daysUntilPayday(payday);
  const daily    = days>0 ? currentBalance/days : currentBalance;
  const spent    = expenses.reduce((s,e)=>s+e.amount,0);
  const remain   = daily - spent;
  const pct      = Math.min((spent/Math.max(daily,0.01))*100,100);
  const isUnder  = spent < daily;
  const barCol   = pct<60?"#34D399":pct<85?"#FBBF24":"#F87171";
  const streak   = (()=>{ let s=0; for(let i=history.length-1;i>=0;i--){if(history[i].under)s++;else break;} return s; })();
  const totalWins= history.filter(h=>h.under).length;

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
    setExpenses(prev=>[...prev,{id:Date.now(),label:label||"Expense",amount:amt}]);
    setDisplay("0"); setLabel(""); setShowCalc(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 20% 10%,#0e1a10 0%,#080f12 55%,#0a0a18 100%)",fontFamily:"'DM Sans',sans-serif",color:"#fff",display:"flex",flexDirection:"column",maxWidth:"420px",margin:"0 auto",padding:"20px 20px 32px",position:"relative"}}>
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

      <Confetti active={confetti}/>
      <TrophyToast trophy={newTrophy} onClose={()=>setNewTrophy(null)}/>

      {/* Modals — priority order */}
      {paydayModal && (
        <PaydayModal
          sym={sym}
          suggestedBalance={paydayModal.suggestedBalance}
          onConfirm={bal=>{
            setSetup(prev=>({...prev,currentBalance:bal}));
            setPaydayModal(null);
          }}
        />
      )}
      {daySummary && !paydayModal && (
        <DaySummaryModal summary={daySummary} sym={sym} onClose={()=>setDaySummary(null)}/>
      )}

      {/* Sheets */}
      <SettingsSheet open={showSettings} onClose={()=>setShowSettings(false)} setup={{...setup,nextPayday:payday}} onSave={s=>{
        const np = getNextPayday(s.paySchedule, s.customPayDate);
        setSetup(prev=>({...prev,...s,nextPayday:np}));
      }}/>
      <HistorySheet open={showHistory} onClose={()=>setShowHistory(false)} history={history} sym={sym} streak={streak} totalWins={totalWins}/>
      <TrophiesSheet open={showTrophies} onClose={()=>setShowTrophies(false)} unlocked={unlocked} allTimeTrophies={allTimeTrophies}/>

      {/* ── TOP BAR ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",letterSpacing:"-0.3px"}}>Day Pay</div>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          {streak>0&&<div style={{background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:"50px",padding:"4px 10px",fontSize:"12px",color:"#FBBF24"}}>🔥{streak}</div>}
          <button onClick={()=>setShowTrophies(true)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",padding:"8px 10px",color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:"16px"}}>🏆</button>
          <button onClick={()=>setShowHistory(true)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",padding:"8px 10px",color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:"16px"}}>📊</button>
          <button onClick={()=>setShowSettings(true)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",padding:"8px 10px",color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:"16px"}}>⚙️</button>
        </div>
      </div>

      {/* ── BUDGET CARD ── */}
      <div style={{background:"linear-gradient(135deg,rgba(52,211,153,0.08),rgba(255,255,255,0.02))",border:"1px solid rgba(52,211,153,0.15)",borderRadius:"24px",padding:"20px",marginBottom:"12px",position:"relative",overflow:"hidden"}}>
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
                {showBudgetTip&&(
                  <div style={{position:"absolute",top:"calc(100%+8px)",left:0,background:"rgba(12,12,28,0.98)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:"14px",padding:"14px",width:"220px",zIndex:50,boxShadow:"0 8px 24px rgba(0,0,0,0.5)",animation:"fadeIn 0.15s ease"}} onClick={()=>setShowBudgetTip(false)}>
                    <div style={{fontSize:"11px",color:"#A78BFA",fontWeight:"600",marginBottom:"5px"}}>💡 How is this calculated?</div>
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.65)",lineHeight:1.7}}>
                      Your daily budget is your <strong style={{color:"#fff"}}>current balance ÷ days until payday</strong> — not including payday itself. This way your budget is based only on the money already in your account, not your upcoming paycheck.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"38px",fontWeight:"700",color:"#34D399",lineHeight:1}}>
              {sym}{daily.toFixed(2)}
            </div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.25)",marginTop:"4px"}}>
              {sym}{currentBalance.toFixed(2)} ÷ {days}d · payday {shortDate(payday)}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"3px"}}>{isUnder?"Left":"Over"}</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"30px",fontWeight:"700",color:isUnder?"#fff":"#F87171",lineHeight:1}}>
              {sym}{Math.abs(remain).toFixed(2)}
            </div>
            <div style={{fontSize:"11px",color:barCol,marginTop:"4px",fontWeight:"600"}}>{pct.toFixed(0)}% used</div>
          </div>
        </div>

        {expenses.length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:"6px",paddingTop:"10px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            {expenses.map(e=>(
              <div key={e.id} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"50px",padding:"4px 10px",display:"flex",alignItems:"center",gap:"6px",fontSize:"12px",color:"rgba(255,255,255,0.75)"}}>
                <span>{e.label}</span>
                <span style={{fontWeight:"700",color:"#fff"}}>{sym}{e.amount.toFixed(2)}</span>
                <button onClick={()=>setExpenses(p=>p.filter(x=>x.id!==e.id))} style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",cursor:"pointer",padding:"0",fontSize:"13px",lineHeight:1}}>×</button>
              </div>
            ))}
            <div style={{width:"100%",display:"flex",justifyContent:"flex-end",paddingTop:"4px"}}>
              <span style={{fontSize:"12px",color:"rgba(255,255,255,0.35)"}}>Total: </span>
              <span style={{fontSize:"12px",color:"#fff",fontWeight:"700",marginLeft:"4px"}}>{sym}{spent.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── ADD EXPENSE BUTTON ── */}
      {!showCalc&&(
        <button onClick={()=>setShowCalc(true)} style={{width:"100%",padding:"18px",marginBottom:"12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"20px",color:"rgba(255,255,255,0.5)",fontFamily:"'DM Sans',sans-serif",fontWeight:"600",fontSize:"15px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
          <span style={{fontSize:"20px"}}>+</span> Add Expense
        </button>
      )}

      {/* ── CALCULATOR ── */}
      {showCalc&&(
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"20px",padding:"16px",marginBottom:"12px",animation:"slideUp 0.25s ease"}}>
          <div style={{background:"rgba(0,0,0,0.3)",borderRadius:"14px",padding:"14px 18px",marginBottom:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase"}}>Amount</div>
              <button onClick={()=>{setShowCalc(false);setDisplay("0");setLabel("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:"18px",cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"40px",fontWeight:"700",color:display==="0"?"rgba(255,255,255,0.2)":"#fff",letterSpacing:"-1px",lineHeight:1,textAlign:"right"}}>
              {sym}{display}
            </div>
          </div>
          <input ref={labelRef} placeholder="What was it? (optional)" value={label} onChange={e=>setLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddExpense()} style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"12px",padding:"11px 14px",color:"#fff",marginBottom:"12px",fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none"}}/>
          <NumPad onKey={handleNumKey}/>
          <button onClick={handleAddExpense} style={{width:"100%",marginTop:"12px",padding:"15px",background:display!=="0"?"rgba(52,211,153,0.15)":"rgba(255,255,255,0.04)",border:display!=="0"?"1px solid rgba(52,211,153,0.3)":"1px solid rgba(255,255,255,0.07)",borderRadius:"14px",color:display!=="0"?"#34D399":"rgba(255,255,255,0.2)",fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"15px",cursor:display!=="0"?"pointer":"default"}}>
            {display!=="0"?`+ Add ${sym}${display}`:"+ Add Expense"}
          </button>
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{textAlign:"center",marginTop:"8px"}}>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.18)"}}>
          {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})} · Day closes at midnight
        </div>
      </div>
    </div>
  );
}
