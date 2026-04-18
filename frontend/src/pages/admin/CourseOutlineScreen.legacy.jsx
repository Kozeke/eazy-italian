/**
 * CourseOutlineScreen.legacy.jsx
 *
 * Step 5 of onboarding — generates ONLY the course outline:
 *   { course_title, description, modules: [{ id, title, lessons: [{id, title, description}] }] }
 *
 * No slides, tasks, or tests are generated here.
 * Those are generated per-lesson inside CourseBuildScreen.
 *
 * While the API call runs, the dashboard skeleton assembles itself
 * to give the teacher a real-time visual sense of what's being built.
 */

import { useState, useEffect, useRef } from "react";
import { T } from "./TeacherOnboarding.legacy";

/* ─── Dashboard skeleton sub-components ─────────────────────────────────── */
const Sk = ({ w="100%", h=14, r=8, delay=0, style={} }) => (
  <div className="shimmer" style={{width:w,height:h,borderRadius:r,flexShrink:0,animationDelay:`${delay}s`,...style}}/>
);

/**
 * Phases:
 *  0 = blank
 *  1 = header appears
 *  2 = sidebar slides in
 *  3 = stat cards pop in
 *  4 = module list builds in
 *  5 = lesson rows fill in
 *  6 = done (all visible, no shimmers)
 */
const DashboardSkeleton = ({ phase, courseData, outline }) => {
  const flag = {Italian:"🇮🇹",Spanish:"🇪🇸",French:"🇫🇷",English:"🇬🇧"}[courseData.subject]||"📚";

  // When outline is available and phase >= 4, show real module/lesson data
  const modules = outline?.modules || [];

  const sideItems = [
    {icon:"📊",label:"Dashboard",active:true},
    {icon:"📚",label:"Courses"},
    {icon:"📖",label:"Modules"},
    {icon:"📝",label:"Lessons"},
    {icon:"🧠",label:"Tests"},
    {icon:"👥",label:"Students"},
    {icon:"📈",label:"Analytics"},
  ];

  return (
    <div style={{
      width:"100%",borderRadius:"20px",overflow:"hidden",
      border:`2px solid ${T.border}`,background:T.white,
      boxShadow:"0 24px 80px rgba(91,63,232,.15)",
      opacity:phase>=1?1:0,transition:"opacity .4s",
      fontFamily:T.bFont,
    }}>
      {/* Header */}
      <div style={{
        background:`linear-gradient(90deg,${T.primary},#7C5CF6)`,
        padding:"14px 20px",display:"flex",alignItems:"center",
        justifyContent:"space-between",gap:"12px",
        opacity:phase>=1?1:0,
        transform:phase>=1?"translateY(0)":"translateY(-100%)",
        transition:"all .5s cubic-bezier(.22,.68,0,1.2)",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{width:32,height:32,borderRadius:"10px",background:"rgba(255,255,255,.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px"}}>🎓</div>
          <span style={{color:"#fff",fontWeight:700,fontSize:"15px",fontFamily:T.dFont}}>EduPlatform</span>
        </div>
        <div style={{display:"flex",gap:"8px"}}>
          {["Courses","Students","Tests"].map((n,i)=>(
            <div key={n} style={{background:"rgba(255,255,255,.18)",borderRadius:"8px",padding:"5px 12px",fontSize:"12px",color:"#fff",fontWeight:600,opacity:phase>=1?1:0,transition:`opacity .3s ${i*.1+.2}s`}}>{n}</div>
          ))}
        </div>
        <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px"}}>👤</div>
      </div>

      <div style={{display:"flex",minHeight:"380px"}}>
        {/* Sidebar */}
        <div style={{
          width:"190px",flexShrink:0,background:"#FAFAFE",
          borderRight:`1px solid ${T.border}`,padding:"14px 10px",
          display:"flex",flexDirection:"column",gap:"3px",
          opacity:phase>=2?1:0,
          transform:phase>=2?"translateX(0)":"translateX(-30px)",
          transition:"all .5s cubic-bezier(.22,.68,0,1.2) .1s",
        }}>
          {sideItems.map(({icon,label,active},i)=>(
            <div key={label} style={{
              display:"flex",alignItems:"center",gap:"9px",
              padding:"8px 10px",borderRadius:"9px",
              background:active?T.primaryL:"transparent",
              opacity:phase>=2?1:0,
              transform:phase>=2?"translateX(0)":"translateX(-16px)",
              transition:`all .35s ${i*.05+.15}s`,
            }}>
              <span style={{fontSize:"13px"}}>{icon}</span>
              <span style={{fontSize:"12px",fontWeight:active?700:500,color:active?T.primary:T.muted}}>{label}</span>
              {active&&<div style={{marginLeft:"auto",width:5,height:5,borderRadius:"50%",background:T.primary}}/>}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{flex:1,padding:"18px",overflowY:"auto"}}>
          {/* Page title row */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",opacity:phase>=2?1:0,transition:"opacity .4s .3s"}}>
            <span style={{fontFamily:T.dFont,fontSize:"17px",fontWeight:800,color:T.text}}>Course Builder</span>
            <div style={{background:T.primaryL,color:T.primary,fontSize:"12px",fontWeight:700,padding:"5px 12px",borderRadius:"999px",display:"flex",alignItems:"center",gap:"5px"}}>
              <span>{flag}</span> {courseData.subject} {courseData.level}
            </div>
          </div>

          {/* Stat cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginBottom:"16px"}}>
            {[
              {label:"Modules",  color:T.primary, val:phase>=6?modules.length:null},
              {label:"Lessons",  color:T.teal,    val:phase>=6?modules.reduce((a,m)=>a+(m.lessons?.length||0),0):null},
              {label:"Tasks",    color:T.coral,   val:phase>=6?"—":null},
              {label:"Tests",    color:T.amber,   val:phase>=6?"—":null},
            ].map(({label,color,val},i)=>(
              <div key={label} style={{background:T.white,border:`2px solid ${T.border}`,borderRadius:"12px",padding:"12px 10px",opacity:phase>=3?1:0,transform:phase>=3?"translateY(0)":"translateY(20px)",transition:`all .4s cubic-bezier(.22,.68,0,1.2) ${i*.07}s`}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:color,marginBottom:"8px"}}/>
                {val!=null
                  ?<><div style={{fontFamily:T.dFont,fontSize:"20px",fontWeight:800,color}}>{val}</div>
                     <div style={{fontSize:"10px",color:T.muted,fontWeight:600,marginTop:"2px"}}>{label}</div></>
                  :<><Sk h={18} w={36} r={5} style={{marginBottom:4}}/><Sk h={9} w={52}/></>
                }
              </div>
            ))}
          </div>

          {/* Module / lesson list */}
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            {phase<4&&[0,1,2].map(i=>(
              <div key={i} style={{background:T.white,border:`2px solid ${T.border}`,borderRadius:"12px",padding:"14px",opacity:phase>=3?1:0,transition:`opacity .3s ${i*.1}s`}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:i===0?8:0}}>
                  <Sk w={20} h={20} r={6} style={{flexShrink:0}}/>
                  <Sk w={`${[55,40,65][i]}%`} h={12}/>
                </div>
                {i===0&&<div style={{paddingLeft:"30px",display:"flex",flexDirection:"column",gap:"6px"}}>
                  <Sk w="70%" h={10}/>
                  <Sk w="50%" h={10}/>
                </div>}
              </div>
            ))}

            {phase>=4&&modules.map((mod,mi)=>(
              <div key={mod.id||mi} style={{background:T.white,border:`2px solid ${T.border}`,borderRadius:"12px",overflow:"hidden",opacity:phase>=4?1:0,transform:phase>=4?"translateY(0)":"translateY(12px)",transition:`all .35s cubic-bezier(.22,.68,0,1.2) ${mi*.08}s`}}>
                {/* Module header */}
                <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 14px",background:T.primaryL}}>
                  <div style={{width:22,height:22,borderRadius:"7px",background:T.primary,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800,flexShrink:0}}>M{mi+1}</div>
                  <span style={{fontSize:"13px",fontWeight:700,color:T.text}}>{mod.title}</span>
                  <span style={{marginLeft:"auto",fontSize:"10px",color:T.muted,fontWeight:600}}>{mod.lessons?.length||0} lessons</span>
                </div>
                {/* Lesson rows */}
                {phase>=5&&(mod.lessons||[]).map((les,li)=>(
                  <div key={les.id||li} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 14px 9px 24px",borderTop:`1px solid ${T.border}`,opacity:phase>=5?1:0,transition:`opacity .25s ${li*.06+.1}s`}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:T.mutedL,flexShrink:0}}/>
                    <span style={{fontSize:"12px",color:T.text,fontWeight:500,flex:1}}>{les.title}</span>
                    <span style={{fontSize:"10px",color:T.mutedL,background:T.bg,padding:"2px 7px",borderRadius:"5px",fontWeight:600}}>Not generated</span>
                  </div>
                ))}
                {phase<5&&(
                  <div style={{padding:"10px 14px 10px 24px",display:"flex",flexDirection:"column",gap:"6px"}}>
                    <Sk w="60%" h={10}/><Sk w="45%" h={10}/>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Phase schedule ─────────────────────────────────────────────────────── */
const PHASES = [
  { label:"Analysing your requirements…",  dashPhase:1, delay:0    },
  { label:"Planning course structure…",    dashPhase:2, delay:900  },
  { label:"Generating module outline…",    dashPhase:3, delay:1800 },
  { label:"Naming lessons…",               dashPhase:4, delay:2700 },
  { label:"Finalising outline…",           dashPhase:5, delay:3500 },
];

/* ─── API: outline only ──────────────────────────────────────────────────── */
async function fetchCourseOutline(courseData) {
  const modulesHint = courseData.unitCount || 4;
  const prompt = `Generate a course outline only (NO lesson content yet) for:

Subject: ${courseData.subject}
Level: ${courseData.level}
Students' native language: ${courseData.nativeLanguage}
Number of modules: ${modulesHint}
${courseData.extraInstructions ? "Teacher notes: " + courseData.extraInstructions : ""}

Return ONLY valid JSON with this exact structure:
{
  "course_title": "...",
  "description": "2-3 sentence overview",
  "modules": [
    {
      "id": "m1",
      "title": "Module title",
      "lessons": [
        { "id": "m1_l1", "title": "Lesson title", "description": "One sentence summary" },
        { "id": "m1_l2", "title": "Lesson title", "description": "One sentence summary" }
      ]
    }
  ]
}

Rules:
- Exactly ${modulesHint} modules
- 2-3 lessons per module
- Titles only — no slides, tasks, or test questions yet
- Lesson descriptions are one sentence each
- All in ${courseData.nativeLanguage}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in response");
  return JSON.parse(match[0]);
}

/* ─── Main screen ────────────────────────────────────────────────────────── */
export default function CourseOutlineScreen({ courseData, onDone, onBack }) {
  const [cur,       setCur]       = useState(0);
  const [dashPhase, setDashPhase] = useState(0);
  const [outline,   setOutline]   = useState(null);
  const [done,      setDone]      = useState(false);
  const [err,       setErr]       = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const startTs = Date.now();

    // Animate phases on a fixed schedule
    PHASES.forEach(({ dashPhase: dp, delay }, i) => {
      setTimeout(() => { setCur(i); setDashPhase(dp); }, delay);
    });

    // API call
    fetchCourseOutline(courseData)
      .then(result => {
        setOutline(result);
        const elapsed   = Date.now() - startTs;
        const minDelay  = PHASES[PHASES.length - 1].delay + 600;
        const remaining = Math.max(minDelay - elapsed, 300);
        setTimeout(() => {
          setDashPhase(6);
          setDone(true);
          setTimeout(() => onDone(result), 1000);
        }, remaining);
      })
      .catch(e => setErr(e.message));
  }, []);

  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:`radial-gradient(ellipse 80% 60% at 50% -10%,${T.primary}18,transparent),${T.bg}`,
      padding:"24px 16px",
    }}>
      <div style={{width:"100%",maxWidth:"800px"}}>

        {/* Status pill */}
        <div style={{textAlign:"center",marginBottom:"24px",animation:"fadeIn .4s both"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:"10px",background:T.white,border:`2px solid ${T.border}`,borderRadius:"999px",padding:"9px 22px"}}>
            {done
              ? <><span style={{color:T.green,fontSize:"16px"}}>✓</span>
                  <span style={{fontWeight:700,color:T.green,fontSize:"14px"}}>Outline ready — building your workspace</span></>
              : <><div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${T.primary}`,borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/><span style={{fontWeight:600,color:T.text,fontSize:"14px"}}>{PHASES[cur]?.label||"Finishing…"}</span></>
            }
          </div>
        </div>

        {/* Dashboard skeleton — hero element */}
        <div style={{animation:"fadeIn .5s both",marginBottom:"24px"}}>
          <DashboardSkeleton phase={dashPhase} courseData={courseData} outline={outline}/>
        </div>

        {/* Step pills */}
        {!done && !err && (
          <div style={{display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap"}}>
            {PHASES.map((s,i)=>(
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:"6px",
                padding:"7px 14px",borderRadius:"999px",
                background:i<cur?`${T.green}15`:i===cur?T.primaryL:T.white,
                border:`1.5px solid ${i<cur?T.green+"44":i===cur?T.primary+"55":T.border}`,
                opacity:i>cur?.4:1,transition:"all .35s",
              }}>
                <span style={{fontSize:"12px",fontWeight:600,color:i<cur?T.green:i===cur?T.primary:T.muted}}>
                  {i<cur?"✓ ":""}{s.label.replace("…","")}
                </span>
              </div>
            ))}
          </div>
        )}

        {err && (
          <div style={{background:T.coralL,border:`2px solid ${T.coral}44`,borderRadius:"14px",padding:"16px 20px",color:T.coral,fontSize:"14px",textAlign:"center",marginTop:"16px"}}>
            <strong>Outline generation failed:</strong> {err}
            <br/>
            <button onClick={onBack} style={{marginTop:"10px",background:"none",border:"none",color:T.coral,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:"13px"}}>
              ← Go back and try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}