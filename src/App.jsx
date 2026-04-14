import { useState, useEffect, useRef } from "react";

// ─── Currencies ───────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CAD", symbol: "$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "$", name: "Australian Dollar" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "MXN", symbol: "$", name: "Mexican Peso" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
];

// ─── Date Helpers ─────────────────────────────────────────────────────────────
function getLastWorkingDay(year, month) {
  let d = new Date(year, month + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}
function getDefaultFinalDay(year, month) {
  let last = getLastWorkingDay(year, month);
  let prev = new Date(last);
  prev.setDate(prev.getDate() - 1);
  while (prev.getDay() === 0 || prev.getDay() === 6) prev.setDate(prev.getDate() - 1);
  return prev;
}
function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr+"T00:00:00"); target.setHours(0,0,0,0);
  if (target <= today) return 1;
  return Math.ceil((target - today) / 86400000);
}
function shortDate(dateStr) {
  return new Date(dateStr+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
}
function longDate(dateStr) {
  return new Date(dateStr+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
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
      {Array.from({length:30}).map((_,i)=>(
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
  useEffect(()=>{ if(trophy){ const t=setTimeout(onClose,3500); return ()=>clearTimeout(t); }}, [trophy]);
  if(!trophy) return null;
  return (
    <div style={{
      position:"fixed",bottom:"24px",left:"50%",transform:"translateX(-50%)",
      background:"linear-gradient(135deg,#1c1c3a,#0f1629)",
      border:"1px solid rgba(255,215,0,0.4)",borderRadius:"20px",
      padding:"14px 20px",display:"flex",alignItems:"center",gap:"12px",
      zIndex:300,boxShadow:"0 8px 40px rgba(255,215,0,0.15),0 4px 20px rgba(0,0,0,0.5)",
      animation:"slideToast 0.4s cubic-bezier(0.34,1.56,0.64,1)",
      maxWidth:"320px",width:"calc(100vw - 48px)"
    }}>
      <span style={{fontSize:"32px",filter:"drop-shadow(0 0 10px rgba(255,215,0,0.6))"}}>{trophy.icon}</span>
      <div>
        <div style={{fontSize:"10px",color:"#FFD700",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"2px"}}>Trophy Unlocked</div>
        <div style={{color:"#fff",fontWeight:"700",fontSize:"15px"}}>{trophy.name}</div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:"12px"}}>{trophy.desc}</div>
      </div>
      <button onClick={onClose} style={{
        marginLeft:"auto",background:"none",border:"none",
        color:"rgba(255,255,255,0.3)",fontSize:"18px",cursor:"pointer",padding:"0 4px",flexShrink:0
      }}>×</button>
    </div>
  );
}

// ─── Settings Sheet ───────────────────────────────────────────────────────────
function SettingsSheet({ open, onClose, setup, onSave, currencyObj }) {
  const [balance, setBalance]   = useState(String(setup.currentBalance));
  const [salary, setSalary]     = useState(String(setup.monthlySalary));
  const [finalDay, setFinalDay] = useState(setup.finalDayDate);
  const [currency, setCurrency] = useState(setup.currency);
  const [showTip, setShowTip]   = useState(false);
  const sym = CURRENCIES.find(c=>c.code===currency)?.symbol || "£";

  useEffect(()=>{
    if(open){
      setBalance(String(setup.currentBalance));
      setSalary(String(setup.monthlySalary));
      setFinalDay(setup.finalDayDate);
      setCurrency(setup.currency);
    }
  },[open]);

  if(!open) return null;

  const days = daysUntil(finalDay);
  const daily = days>0 ? (parseFloat(balance)||0)/days : 0;

  return (
    <div style={{
      position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"
    }}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div style={{
        position:"relative",
        background:"linear-gradient(180deg,#111827 0%,#0d1117 100%)",
        borderRadius:"28px 28px 0 0",
        padding:"0 0 40px",
        maxHeight:"90vh",overflowY:"auto",
        animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"
      }}>
        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)"}}/>
        </div>

        <div style={{padding:"0 24px"}}>
          <div style={{
            fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",
            marginBottom:"24px",color:"#fff"
          }}>Settings</div>

          {/* Currency */}
          <div style={{marginBottom:"20px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px"}}>Currency</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px"}}>
              {CURRENCIES.map(c=>(
                <button key={c.code} onClick={()=>setCurrency(c.code)} style={{
                  padding:"10px 4px",borderRadius:"12px",border:"none",
                  background: currency===c.code ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.05)",
                  border: currency===c.code ? "1px solid rgba(167,139,250,0.5)" : "1px solid rgba(255,255,255,0.07)",
                  color: currency===c.code ? "#A78BFA" : "rgba(255,255,255,0.5)",
                  fontFamily:"'DM Sans',sans-serif",fontSize:"12px",fontWeight:"600",
                  cursor:"pointer",transition:"all 0.15s",
                  display:"flex",flexDirection:"column",alignItems:"center",gap:"2px"
                }}>
                  <span style={{fontSize:"16px"}}>{c.symbol}</span>
                  <span style={{fontSize:"10px",opacity:0.7}}>{c.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Balance */}
          <div style={{marginBottom:"16px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>Current Balance</div>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:"16px",top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.3)",fontSize:"18px",fontFamily:"'Cormorant Garamond',serif"}}>{sym}</span>
              <input type="number" value={balance} onChange={e=>setBalance(e.target.value)}
                style={{
                  width:"100%",background:"rgba(255,255,255,0.06)",
                  border:"1px solid rgba(255,255,255,0.1)",borderRadius:"14px",
                  padding:"14px 16px 14px 40px",color:"#fff",
                  fontFamily:"'Cormorant Garamond',serif",fontSize:"22px",fontWeight:"600",
                  outline:"none",boxSizing:"border-box"
                }}
              />
            </div>
          </div>

          {/* Salary */}
          <div style={{marginBottom:"16px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"8px"}}>Monthly Income</div>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:"16px",top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.3)",fontSize:"18px",fontFamily:"'Cormorant Garamond',serif"}}>{sym}</span>
              <input type="number" value={salary} onChange={e=>setSalary(e.target.value)}
                style={{
                  width:"100%",background:"rgba(255,255,255,0.06)",
                  border:"1px solid rgba(255,255,255,0.1)",borderRadius:"14px",
                  padding:"14px 16px 14px 40px",color:"#fff",
                  fontFamily:"'Cormorant Garamond',serif",fontSize:"22px",fontWeight:"600",
                  outline:"none",boxSizing:"border-box"
                }}
              />
            </div>
          </div>

          {/* Final Day Pay Date */}
          <div style={{marginBottom:"20px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px",textTransform:"uppercase"}}>Final Day Pay Date</div>
              <div style={{
                width:"16px",height:"16px",borderRadius:"50%",
                background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.35)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:"10px",color:"#A78BFA",cursor:"pointer",flexShrink:0,position:"relative"
              }}
                onMouseEnter={()=>setShowTip(true)} onMouseLeave={()=>setShowTip(false)}
                onTouchStart={()=>setShowTip(v=>!v)}
              >?
                {showTip && (
                  <div style={{
                    position:"absolute",bottom:"calc(100%+8px)",left:"50%",transform:"translateX(-50%)",
                    background:"rgba(12,12,28,0.98)",border:"1px solid rgba(167,139,250,0.3)",
                    borderRadius:"12px",padding:"12px 14px",width:"240px",zIndex:10,
                    boxShadow:"0 8px 24px rgba(0,0,0,0.5)",pointerEvents:"none",textAlign:"left"
                  }}>
                    <div style={{fontSize:"11px",color:"#A78BFA",fontWeight:"600",marginBottom:"5px"}}>💡 Why the day before payday?</div>
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.65)",lineHeight:1.6}}>
                      Setting this to the day before your salary lands means your daily budget is based only on what you currently have — not money you haven't received yet.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <input type="date" value={finalDay} onChange={e=>setFinalDay(e.target.value)}
              style={{
                width:"100%",background:"rgba(255,255,255,0.06)",
                border:"1px solid rgba(167,139,250,0.25)",borderRadius:"14px",
                padding:"14px 16px",color:"#fff",
                fontFamily:"'DM Sans',sans-serif",fontSize:"15px",fontWeight:"600",
                outline:"none",colorScheme:"dark",boxSizing:"border-box"
              }}
            />
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"6px"}}>
              {longDate(finalDay)} · <span style={{color:"rgba(255,255,255,0.6)",fontWeight:"600"}}>{days} days away</span>
              {daily>0 && <span style={{color:"#34D399",marginLeft:"8px"}}>= {sym}{daily.toFixed(2)}/day</span>}
            </div>
          </div>

          {/* Save */}
          <button onClick={()=>{
            const bal = parseFloat(balance)||0;
            const sal = parseFloat(salary)||0;
            if(bal>0) onSave({ currentBalance:bal, monthlySalary:sal, finalDayDate:finalDay, currency });
            onClose();
          }} style={{
            width:"100%",padding:"16px",
            background:"linear-gradient(135deg,#A78BFA,#7C3AED)",
            border:"none",borderRadius:"16px",color:"#fff",
            fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"16px",
            cursor:"pointer",boxShadow:"0 6px 24px rgba(167,139,250,0.3)"
          }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─── Number Pad ───────────────────────────────────────────────────────────────
function NumPad({ onKey }) {
  const keys = ["7","8","9","4","5","6","1","2","3","⌫","0","."];
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
      {keys.map(k=>(
        <button key={k} onClick={()=>onKey(k)} style={{
          padding:"18px 0",borderRadius:"16px",border:"none",
          background: k==="⌫" ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.06)",
          color: k==="⌫" ? "#F87171" : "rgba(255,255,255,0.85)",
          fontSize: k==="⌫" ? "20px" : "22px",
          fontWeight:"600",fontFamily:"'DM Sans',sans-serif",
          cursor:"pointer",transition:"all 0.1s",
          active:{transform:"scale(0.95)"}
        }}>{k}</button>
      ))}
    </div>
  );
}

// ─── History Sheet ────────────────────────────────────────────────────────────
function HistorySheet({ open, onClose, history, sym, streak, totalWins }) {
  if(!open) return null;
  const week = [...history].slice(-7);
  const maxH = Math.max(...week.map(h=>h.spent),1);

  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div style={{
        position:"relative",background:"linear-gradient(180deg,#111827 0%,#0d1117 100%)",
        borderRadius:"28px 28px 0 0",padding:"0 0 40px",maxHeight:"80vh",overflowY:"auto",
        animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"
      }}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff"}}>History</div>
            <div style={{display:"flex",gap:"12px"}}>
              {streak>0&&<div style={{fontSize:"13px",color:"#FBBF24"}}>🔥 {streak} streak</div>}
              <div style={{fontSize:"13px",color:"#34D399"}}>✓ {totalWins} days</div>
            </div>
          </div>

          {history.length===0 ? (
            <div style={{textAlign:"center",padding:"40px 0",color:"rgba(255,255,255,0.25)",fontSize:"14px"}}>
              End your first day to see history
            </div>
          ) : (
            <>
              {/* Mini bar chart */}
              <div style={{
                background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:"16px",padding:"16px",marginBottom:"16px",
                display:"flex",alignItems:"flex-end",gap:"6px",height:"72px",justifyContent:"space-around"
              }}>
                {week.map((h,i)=>(
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"4px",flex:1}}>
                    <div style={{
                      width:"100%",maxWidth:"32px",
                      height:`${Math.max((h.spent/maxH)*50,4)}px`,
                      background:h.under?"#34D399":"#F87171",
                      borderRadius:"4px 4px 2px 2px",transition:"height 0.3s"
                    }}/>
                    <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)"}}>{h.date}</div>
                  </div>
                ))}
              </div>

              {[...history].reverse().map((h,i)=>(
                <div key={i} style={{
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                    <span style={{fontSize:"16px"}}>{h.under?"✅":"❌"}</span>
                    <div>
                      <div style={{fontWeight:"600",fontSize:"14px",color:"#fff"}}>{h.date}</div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Trophies Sheet ───────────────────────────────────────────────────────────
function TrophiesSheet({ open, onClose, unlocked }) {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div style={{
        position:"relative",background:"linear-gradient(180deg,#111827 0%,#0d1117 100%)",
        borderRadius:"28px 28px 0 0",padding:"0 0 40px",maxHeight:"80vh",overflowY:"auto",
        animation:"sheetUp 0.35s cubic-bezier(0.34,1.2,0.64,1)"
      }}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)"}}/>
        </div>
        <div style={{padding:"0 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"26px",fontWeight:"700",color:"#fff"}}>Trophies</div>
            <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>{unlocked.length}/{TROPHIES.length}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"16px"}}>
            {TROPHIES.map(t=>{
              const got=unlocked.includes(t.id);
              return (
                <div key={t.id} style={{
                  background:got?"rgba(255,215,0,0.07)":"rgba(255,255,255,0.025)",
                  border:`1px solid ${got?"rgba(255,215,0,0.2)":"rgba(255,255,255,0.06)"}`,
                  borderRadius:"18px",padding:"18px 12px",textAlign:"center",
                  filter:got?"none":"grayscale(1) opacity(0.3)"
                }}>
                  <div style={{fontSize:"36px",marginBottom:"8px"}}>{t.icon}</div>
                  <div style={{fontWeight:"700",fontSize:"13px",color:"#fff",marginBottom:"4px"}}>{t.name}</div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,0.38)",lineHeight:1.4}}>{t.desc}</div>
                  {got&&<div style={{marginTop:"6px",fontSize:"10px",color:"#FFD700",letterSpacing:"1px"}}>✓ UNLOCKED</div>}
                </div>
              );
            })}
          </div>
          <div style={{
            background:"rgba(167,139,250,0.05)",border:"1px dashed rgba(167,139,250,0.18)",
            borderRadius:"14px",padding:"16px",textAlign:"center"
          }}>
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

// ─── Setup Screen (single page) ───────────────────────────────────────────────
function SetupScreen({ onComplete }) {
  const today = new Date();
  const defFinal = getDefaultFinalDay(today.getFullYear(), today.getMonth());

  const [currency, setCurrency] = useState("GBP");
  const [salaryInput, setSalaryInput] = useState("");
  const [balanceInput, setBalanceInput] = useState("");
  const [finalDay, setFinalDay] = useState(toISO(defFinal));
  const [showTip, setShowTip] = useState(false);

  const sym = CURRENCIES.find(c=>c.code===currency)?.symbol || "£";
  const days = daysUntil(finalDay);
  const salaryNum  = parseFloat(salaryInput)  || 0;
  const balanceNum = parseFloat(balanceInput) || 0;
  const daily = days>0 && balanceNum>0 ? balanceNum/days : 0;
  const canGo = balanceNum>0;

  const handleNumKey = (which, key) => {
    const setter = which==="salary" ? setSalaryInput : setBalanceInput;
    const current = which==="salary" ? salaryInput : balanceInput;
    if(key==="⌫") { setter(current.slice(0,-1)); return; }
    if(key==="." && current.includes(".")) return;
    if(current==="0" && key!==".") { setter(key); return; }
    setter(current+key);
  };

  const [activeField, setActiveField] = useState("balance");

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 30% 15%,#1a1040 0%,#0a0a18 55%,#0d1a0a 100%)",
      display:"flex",flexDirection:"column",
      padding:"32px 24px 24px",
      fontFamily:"'DM Sans',sans-serif",color:"#fff",
      maxWidth:"420px",margin:"0 auto",
      overflowY:"auto"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes fall{to{transform:translateY(110vh) rotate(720deg);opacity:0}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideToast{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.6) sepia(1) saturate(3) hue-rotate(220deg);cursor:pointer}
        button:active{transform:scale(0.96)}
      `}</style>

      {/* Logo */}
      <div style={{textAlign:"center",marginBottom:"28px",animation:"slideUp 0.4s ease"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"38px",fontWeight:"700",letterSpacing:"-0.5px"}}>Day Pay</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>Smart budgets · Real rewards</div>
      </div>

      {/* Currency row */}
      <div style={{marginBottom:"20px",animation:"slideUp 0.45s ease"}}>
        <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"2.5px",textTransform:"uppercase",marginBottom:"8px"}}>Currency</div>
        <div style={{display:"flex",gap:"6px",overflowX:"auto",paddingBottom:"4px"}}>
          {CURRENCIES.map(c=>(
            <button key={c.code} onClick={()=>setCurrency(c.code)} style={{
              flexShrink:0,padding:"8px 12px",borderRadius:"10px",border:"none",
              background:currency===c.code?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.05)",
              border:currency===c.code?"1px solid rgba(167,139,250,0.45)":"1px solid rgba(255,255,255,0.07)",
              color:currency===c.code?"#A78BFA":"rgba(255,255,255,0.45)",
              fontFamily:"'DM Sans',sans-serif",fontSize:"13px",fontWeight:"600",cursor:"pointer"
            }}>{c.symbol} {c.code}</button>
          ))}
        </div>
      </div>

      {/* Two display fields */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"16px",animation:"slideUp 0.5s ease"}}>
        {/* Monthly income */}
        <div onClick={()=>setActiveField("salary")} style={{
          background: activeField==="salary" ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${activeField==="salary"?"rgba(167,139,250,0.4)":"rgba(255,255,255,0.08)"}`,
          borderRadius:"18px",padding:"16px",cursor:"pointer",transition:"all 0.2s"
        }}>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>Monthly Income</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"22px",fontWeight:"700",color:activeField==="salary"?"#A78BFA":"#fff",minHeight:"30px"}}>
            {salaryInput ? `${sym}${salaryInput}` : <span style={{color:"rgba(255,255,255,0.2)"}}>{sym}—</span>}
          </div>
        </div>

        {/* Current balance */}
        <div onClick={()=>setActiveField("balance")} style={{
          background: activeField==="balance" ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${activeField==="balance"?"rgba(52,211,153,0.4)":"rgba(255,255,255,0.08)"}`,
          borderRadius:"18px",padding:"16px",cursor:"pointer",transition:"all 0.2s"
        }}>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>Current Balance</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"22px",fontWeight:"700",color:activeField==="balance"?"#34D399":"#fff",minHeight:"30px"}}>
            {balanceInput ? `${sym}${balanceInput}` : <span style={{color:"rgba(255,255,255,0.2)"}}>{sym}—</span>}
          </div>
        </div>
      </div>

      {/* Final Day Pay Date */}
      <div style={{marginBottom:"16px",animation:"slideUp 0.55s ease"}}>
        <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"8px"}}>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"2.5px",textTransform:"uppercase"}}>Final Day Pay Date</div>
          <div style={{
            width:"15px",height:"15px",borderRadius:"50%",
            background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.35)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:"9px",color:"#A78BFA",cursor:"pointer",flexShrink:0,position:"relative"
          }}
            onMouseEnter={()=>setShowTip(true)} onMouseLeave={()=>setShowTip(false)}
            onTouchStart={()=>setShowTip(v=>!v)}
          >?
            {showTip&&(
              <div style={{
                position:"absolute",bottom:"calc(100%+8px)",left:0,
                background:"rgba(12,12,28,0.98)",border:"1px solid rgba(167,139,250,0.3)",
                borderRadius:"12px",padding:"12px 14px",width:"240px",zIndex:20,
                boxShadow:"0 8px 24px rgba(0,0,0,0.5)",pointerEvents:"none",textAlign:"left"
              }}>
                <div style={{fontSize:"11px",color:"#A78BFA",fontWeight:"600",marginBottom:"4px"}}>💡 Why the day before payday?</div>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.65)",lineHeight:1.6}}>Setting this to the day before your salary lands keeps your daily budget based on what you have now — not money you haven't received yet.</div>
              </div>
            )}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <input type="date" value={finalDay} onChange={e=>setFinalDay(e.target.value)} style={{
            flex:1,background:"rgba(255,255,255,0.05)",
            border:"1px solid rgba(167,139,250,0.25)",borderRadius:"14px",
            padding:"12px 16px",color:"#fff",
            fontFamily:"'DM Sans',sans-serif",fontSize:"14px",fontWeight:"600",
            outline:"none",colorScheme:"dark"
          }}/>
          <div style={{
            background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",
            borderRadius:"12px",padding:"10px 14px",textAlign:"center",flexShrink:0
          }}>
            <div style={{fontSize:"18px",fontWeight:"700",color:"#34D399",fontFamily:"'Cormorant Garamond',serif"}}>{days}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>days</div>
          </div>
        </div>
        {daily>0&&(
          <div style={{marginTop:"8px",fontSize:"13px",color:"#34D399",fontWeight:"600"}}>
            = {sym}{daily.toFixed(2)} / day
          </div>
        )}
      </div>

      {/* Numpad */}
      <div style={{marginBottom:"16px",animation:"slideUp 0.6s ease"}}>
        <NumPad onKey={k=>handleNumKey(activeField,k)}/>
      </div>

      {/* Go */}
      <button onClick={()=>{
        if(canGo) onComplete({
          monthlySalary:salaryNum,
          currentBalance:balanceNum,
          finalDayDate:finalDay,
          currency
        });
      }} style={{
        width:"100%",padding:"18px",
        background:canGo?"linear-gradient(135deg,#34D399,#059669)":"rgba(255,255,255,0.05)",
        border:"none",borderRadius:"18px",
        color:canGo?"#061a0e":"rgba(255,255,255,0.2)",
        fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"17px",
        cursor:canGo?"pointer":"default",
        boxShadow:canGo?"0 8px 28px rgba(52,211,153,0.28)":"none",
        transition:"all 0.3s",animation:"slideUp 0.65s ease"
      }}>
        {canGo ? `Start — ${sym}${daily.toFixed(2)}/day 🚀` : "Enter your balance to begin"}
      </button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function DayPay() {
  const [setup, setSetup]             = useState(null);
  const [display, setDisplay]         = useState("0");   // current expense being typed
  const [expenses, setExpenses]       = useState([]);
  const [label, setLabel]             = useState("");
  const [history, setHistory]         = useState([]);
  const [unlocked, setUnlocked]       = useState([]);
  const [newTrophy, setNewTrophy]     = useState(null);
  const [confetti, setConfetti]       = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [showTrophies, setShowTrophies]   = useState(false);
  const labelRef = useRef(null);

  if (!setup) return <SetupScreen onComplete={setSetup} />;

  const { currency, currentBalance, finalDayDate } = setup;
  const sym    = CURRENCIES.find(c=>c.code===currency)?.symbol || "£";
  const days   = daysUntil(finalDayDate);
  const daily  = days>0 ? currentBalance/days : currentBalance;
  const spent  = expenses.reduce((s,e)=>s+e.amount,0);
  const remain = daily - spent;
  const pct    = Math.min((spent/Math.max(daily,0.01))*100,100);
  const isUnder= spent < daily;
  const barCol = pct<60?"#34D399":pct<85?"#FBBF24":"#F87171";

  const streak = (()=>{
    let s=0;
    for(let i=history.length-1;i>=0;i--){ if(history[i].under)s++; else break; }
    return s;
  })();
  const totalWins = history.filter(h=>h.under).length;
  const lastDay   = history[history.length-1];
  const lastSaving = lastDay ? Math.max(0,lastDay.budget-lastDay.spent) : 0;
  const lastRatio  = lastDay&&lastDay.budget>0 ? lastDay.spent/lastDay.budget : 1;

  const checkTrophies = (ns) => {
    TROPHIES.forEach(t=>{
      if(!unlocked.includes(t.id) && t.condition(ns)){
        setUnlocked(p=>[...p,t.id]);
        setNewTrophy(t);
        setConfetti(true);
        setTimeout(()=>setConfetti(false),3200);
      }
    });
  };

  const handleNumKey = (key) => {
    if(key==="⌫"){ setDisplay(d=> d.length>1 ? d.slice(0,-1) : "0"); return; }
    if(key==="." && display.includes(".")) return;
    if(display==="0" && key!==".") { setDisplay(key); return; }
    if(display.length>=10) return;
    setDisplay(d=>d+key);
  };

  const handleAddExpense = () => {
    const amt = parseFloat(display);
    if(!amt||amt<=0) return;
    setExpenses(p=>[...p,{id:Date.now(),label:label||"Expense",amount:amt}]);
    setDisplay("0");
    setLabel("");
    if(labelRef.current) labelRef.current.focus();
  };

  const handleEndDay = () => {
    const dateStr = new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short"});
    setHistory(p=>[...p,{date:dateStr,spent,budget:daily,under:isUnder}]);
    setSetup(p=>({...p,currentBalance:Math.max(0,currentBalance-spent)}));
    setExpenses([]); setDisplay("0"); setLabel("");
    const ns={
      streak:isUnder?streak+1:0,
      totalWins:totalWins+(isUnder?1:0),
      lastSaving:Math.max(0,daily-spent),
      lastRatio:daily>0?spent/daily:1
    };
    setTimeout(()=>checkTrophies(ns),120);
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 20% 10%,#0e1a10 0%,#080f12 55%,#0a0a18 100%)",
      fontFamily:"'DM Sans',sans-serif",color:"#fff",
      display:"flex",flexDirection:"column",
      maxWidth:"420px",margin:"0 auto",
      padding:"20px 20px 28px",position:"relative"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes fall{to{transform:translateY(110vh) rotate(720deg);opacity:0}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideToast{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.6) sepia(1) saturate(3) hue-rotate(220deg);cursor:pointer}
        button:active{transform:scale(0.96)}
      `}</style>

      <Confetti active={confetti}/>
      <TrophyToast trophy={newTrophy} onClose={()=>setNewTrophy(null)}/>
      <SettingsSheet
        open={showSettings} onClose={()=>setShowSettings(false)}
        setup={setup} onSave={s=>setSetup(p=>({...p,...s}))}
        currencyObj={CURRENCIES.find(c=>c.code===currency)}
      />
      <HistorySheet
        open={showHistory} onClose={()=>setShowHistory(false)}
        history={history} sym={sym} streak={streak} totalWins={totalWins}
      />
      <TrophiesSheet
        open={showTrophies} onClose={()=>setShowTrophies(false)}
        unlocked={unlocked}
      />

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

      {/* ── BUDGET DISPLAY ── */}
      <div style={{
        background:"linear-gradient(135deg,rgba(52,211,153,0.08),rgba(255,255,255,0.02))",
        border:"1px solid rgba(52,211,153,0.15)",
        borderRadius:"24px",padding:"20px",marginBottom:"12px",position:"relative",overflow:"hidden"
      }}>
        {/* Progress bar top */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:"3px"}}>
          <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${barCol}88,${barCol})`,transition:"width 0.4s ease"}}/>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
          <div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"3px"}}>Daily Budget</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"38px",fontWeight:"700",color:"#34D399",lineHeight:1}}>
              {sym}{daily.toFixed(2)}
            </div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.25)",marginTop:"4px"}}>
              {sym}{currentBalance.toFixed(2)} ÷ {days}d · {shortDate(finalDayDate)}
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

        {/* Expense pills */}
        {expenses.length>0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:"6px",paddingTop:"10px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            {expenses.map(e=>(
              <div key={e.id} style={{
                background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:"50px",padding:"4px 10px",
                display:"flex",alignItems:"center",gap:"6px",fontSize:"12px",color:"rgba(255,255,255,0.75)"
              }}>
                <span>{e.label}</span>
                <span style={{fontWeight:"700",color:"#fff"}}>{sym}{e.amount.toFixed(2)}</span>
                <button onClick={()=>setExpenses(p=>p.filter(x=>x.id!==e.id))} style={{
                  background:"none",border:"none",color:"rgba(255,255,255,0.35)",
                  cursor:"pointer",padding:"0",fontSize:"13px",lineHeight:1
                }}>×</button>
              </div>
            ))}
            <div style={{width:"100%",display:"flex",justifyContent:"flex-end",paddingTop:"4px"}}>
              <span style={{fontSize:"12px",color:"rgba(255,255,255,0.35)"}}>Total: </span>
              <span style={{fontSize:"12px",color:"#fff",fontWeight:"700",marginLeft:"4px"}}>{sym}{spent.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── CALCULATOR INPUT ── */}
      <div style={{
        background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
        borderRadius:"20px",padding:"16px",marginBottom:"12px"
      }}>
        {/* Amount display */}
        <div style={{
          background:"rgba(0,0,0,0.3)",borderRadius:"14px",padding:"14px 18px",
          marginBottom:"12px",textAlign:"right",position:"relative"
        }}>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px",textAlign:"left"}}>Amount</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"40px",fontWeight:"700",
            color:display==="0"?"rgba(255,255,255,0.2)":"#fff",letterSpacing:"-1px",lineHeight:1}}>
            {sym}{display}
          </div>
        </div>

        {/* Label input */}
        <input
          ref={labelRef}
          placeholder="Label (optional)"
          value={label}
          onChange={e=>setLabel(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleAddExpense()}
          style={{
            width:"100%",background:"rgba(255,255,255,0.05)",
            border:"1px solid rgba(255,255,255,0.08)",borderRadius:"12px",
            padding:"11px 14px",color:"#fff",marginBottom:"12px",
            fontFamily:"'DM Sans',sans-serif",fontSize:"14px",outline:"none"
          }}
        />

        {/* Numpad */}
        <NumPad onKey={handleNumKey}/>

        {/* Add button */}
        <button onClick={handleAddExpense} style={{
          width:"100%",marginTop:"12px",padding:"15px",
          background: display!=="0" ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
          border: display!=="0" ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(255,255,255,0.07)",
          borderRadius:"14px",
          color: display!=="0" ? "#34D399" : "rgba(255,255,255,0.2)",
          fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"15px",
          cursor: display!=="0" ? "pointer" : "default",transition:"all 0.2s"
        }}>
          {display!=="0" ? `+ Add ${sym}${display}` : "+ Add Expense"}
        </button>
      </div>

      {/* ── END DAY ── */}
      <button onClick={handleEndDay} style={{
        width:"100%",padding:"17px",
        background: isUnder ? "linear-gradient(135deg,#34D399,#059669)" : "rgba(255,255,255,0.06)",
        border: isUnder ? "none" : "1px solid rgba(255,255,255,0.09)",
        borderRadius:"18px",
        color: isUnder ? "#061a0e" : "rgba(255,255,255,0.45)",
        fontFamily:"'DM Sans',sans-serif",fontWeight:"700",fontSize:"15px",
        cursor:"pointer",letterSpacing:"0.2px",
        boxShadow: isUnder ? "0 6px 28px rgba(52,211,153,0.25)" : "none",
        transition:"all 0.3s"
      }}>
        {isUnder ? `✓ End Day  ·  Saved ${sym}${remain.toFixed(2)}` : "End Day"}
      </button>
    </div>
  );
}
