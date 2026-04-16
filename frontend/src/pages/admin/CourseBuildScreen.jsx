/**
 * CourseBuildScreen.jsx
 *
 * Step 6 — lesson-by-lesson course builder.
 *
 * Layout: two-column (outline tree left, lesson editor right)
 *
 * State shape:
 * {
 *   outline,                     // from CourseOutlineScreen
 *   currentLessonId,             // which lesson is open in the editor
 *   generatedLessons: {          // lessonId -> { slides, tasks, test }
 *     [lessonId]: { slides, tasks, test, editedSlides? }
 *   },
 *   lessonGenerationStatus: {    // lessonId -> 'idle'|'generating'|'done'|'error'
 *     [lessonId]: string
 *   },
 *   lessonSources: {             // lessonId -> { hasRag: bool }
 *     [lessonId]: { hasRag }
 *   }
 * }
 *
 * API strategy:
 *  - generateCourseOutline()    → already done; outline is a prop
 *  - generateLessonContent(id)  → single API call per lesson, in isolation
 *  - saveLessonEdits(id, data)  → local state only (real save = POST /admin/lessons)
 *
 * RAG: the generation prompt explicitly instructs the AI to use
 * teacher-uploaded unit materials (via the existing RAG pipeline).
 * The frontend shows a "📄 Materials available" badge on lessons
 * belonging to modules that have uploaded files.
 */

import { useState, useCallback } from "react";
import { T } from "./TeacherOnboarding";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const Spinner = ({ size = 16, color = T.primary }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%",
    border: `2px solid ${color}33`,
    borderTopColor: color,
    animation: "spin .7s linear infinite",
    flexShrink: 0,
  }}/>
);

const Badge = ({ children, color, bg }) => (
  <span style={{
    display:"inline-flex", alignItems:"center", gap:"4px",
    background: bg, color, fontSize:"10px", fontWeight:700,
    padding:"3px 8px", borderRadius:"6px", letterSpacing:".04em",
  }}>
    {children}
  </span>
);

/* ─── Lesson status badge ────────────────────────────────────────────────── */
const LessonStatusBadge = ({ status }) => {
  const map = {
    idle:       { label:"Not generated", color:T.muted,   bg:T.bg        },
    generating: { label:"Generating…",   color:T.primary, bg:T.primaryL  },
    done:       { label:"Ready ✓",       color:T.green,   bg:T.greenL    },
    error:      { label:"Error",         color:T.error,   bg:T.coralL    },
  };
  const s = map[status] || map.idle;
  return <Badge color={s.color} bg={s.bg}>{s.label}</Badge>;
};

/* ─── RAG indicator ──────────────────────────────────────────────────────── */
const RagBadge = () => (
  <span title="AI will use your uploaded materials for this lesson" style={{
    display:"inline-flex", alignItems:"center", gap:"4px",
    background:"#FFF8E1", color:"#92400E", fontSize:"10px", fontWeight:700,
    padding:"3px 8px", borderRadius:"6px", cursor:"help",
  }}>
    📄 Materials available
  </span>
);

/* ─── Slide editor card ──────────────────────────────────────────────────── */
const SlideCard = ({ slide, index, onChange }) => (
  <div style={{
    background: T.white, border:`2px solid ${T.border}`,
    borderRadius:"12px", padding:"16px", marginBottom:"10px",
    animation:"fadeUp .3s both",
  }}>
    <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
      <div style={{
        width:26, height:26, borderRadius:"8px",
        background:T.primaryL, color:T.primary,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:T.dFont, fontSize:"12px", fontWeight:800, flexShrink:0,
      }}>{index+1}</div>
      <input
        value={slide.title}
        onChange={e=>onChange({...slide,title:e.target.value})}
        placeholder="Slide title"
        style={{flex:1,background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:"8px",padding:"7px 12px",fontFamily:T.bFont,fontSize:"13px",fontWeight:700,color:T.text,outline:"none"}}
      />
    </div>
    <textarea
      className="slide-editor"
      rows={4}
      value={slide.content}
      onChange={e=>onChange({...slide,content:e.target.value})}
      placeholder="Slide content — edit before generating the next lesson"
    />
  </div>
);

/* ─── Task card ──────────────────────────────────────────────────────────── */
const TaskCard = ({ task, index }) => (
  <div style={{
    background:T.white, border:`2px solid ${T.border}`, borderRadius:"12px",
    padding:"14px 16px", marginBottom:"8px", animation:"fadeUp .3s both",
  }}>
    <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
      <div style={{
        width:26, height:26, borderRadius:"8px",
        background:T.tealL, color:T.teal,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:T.dFont, fontSize:"12px", fontWeight:800, flexShrink:0, marginTop:2,
      }}>{index+1}</div>
      <div style={{flex:1}}>
        <p style={{fontSize:"13px",fontWeight:700,color:T.text,marginBottom:"4px"}}>{task.title}</p>
        <p style={{fontSize:"12px",color:T.muted,lineHeight:1.6}}>{task.description}</p>
        <div style={{marginTop:"8px"}}>
          <Badge color={T.teal} bg={T.tealL}>{task.type==="gap_fill"?"Gap-fill":"Written task"}</Badge>
        </div>
      </div>
    </div>
  </div>
);

/* ─── Test question card ─────────────────────────────────────────────────── */
const QuestionCard = ({ q, index }) => (
  <div style={{
    background:T.white, border:`2px solid ${T.border}`, borderRadius:"12px",
    padding:"14px 16px", marginBottom:"8px", animation:"fadeUp .3s both",
  }}>
    <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
      <div style={{
        width:26, height:26, borderRadius:"8px",
        background:T.coralL, color:T.coral,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:T.dFont, fontSize:"12px", fontWeight:800, flexShrink:0, marginTop:2,
      }}>Q{index+1}</div>
      <div style={{flex:1}}>
        <p style={{fontSize:"13px",fontWeight:700,color:T.text,marginBottom:"8px"}}>{q.prompt_rich}</p>
        <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
          {(q.options||[]).map((opt,oi)=>{
            const correct = Array.isArray(q.correct_answer)
              ? q.correct_answer[0]===opt
              : q.correct_answer===opt;
            return (
              <div key={oi} style={{
                display:"flex",alignItems:"center",gap:"8px",
                padding:"6px 10px",borderRadius:"8px",
                background:correct?T.greenL:T.bg,
                border:`1.5px solid ${correct?T.green+"66":T.border}`,
              }}>
                <div style={{
                  width:16, height:16, borderRadius:"50%",
                  background:correct?T.green:T.border,
                  color:"#fff", fontSize:"9px", fontWeight:700,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                }}>{correct?"✓":String.fromCharCode(65+oi)}</div>
                <span style={{fontSize:"12px",color:T.text,fontWeight:correct?700:400}}>{opt}</span>
              </div>
            );
          })}
        </div>
        {q.explanation_rich&&(
          <p style={{marginTop:"8px",fontSize:"11px",color:T.muted,background:T.bg,borderRadius:"6px",padding:"6px 10px",lineHeight:1.5}}>
            💡 {q.explanation_rich}
          </p>
        )}
      </div>
    </div>
  </div>
);

/* ─── Lesson editor panel ────────────────────────────────────────────────── */
const LessonEditor = ({
  lesson, moduleTitle, lessonData, status, hasRag,
  onGenerate, onSaveSlide, onRegenerate,
}) => {
  const [tab, setTab] = useState("slides");

  const slides    = lessonData?.editedSlides || lessonData?.slides || [];
  const tasks     = lessonData?.tasks || [];
  const questions = lessonData?.test?.questions || [];

  const tabs = [
    {id:"slides", label:"Slides",  count:slides.length},
    {id:"tasks",  label:"Tasks",   count:tasks.length},
    {id:"test",   label:"Test",    count:questions.length},
  ];

  if (!lesson) return (
    <div style={{
      flex:1, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:T.bg, borderRadius:"16px", border:`2px dashed ${T.border}`,
      padding:"40px", textAlign:"center",
    }}>
      <div style={{fontSize:"48px",marginBottom:"16px",opacity:.4}}>←</div>
      <p style={{fontFamily:T.dFont,fontSize:"16px",fontWeight:700,color:T.muted,marginBottom:"6px"}}>Select a lesson</p>
      <p style={{fontSize:"13px",color:T.mutedL}}>Click any lesson in the outline to generate and edit its content.</p>
    </div>
  );

  return (
    <div style={{
      flex:1, display:"flex", flexDirection:"column",
      background:T.white, borderRadius:"16px", border:`2px solid ${T.border}`,
      overflow:"hidden", minHeight:0,
    }}>
      {/* Lesson header */}
      <div style={{
        padding:"16px 20px",
        borderBottom:`2px solid ${T.border}`,
        background:T.primaryL,
      }}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"12px",marginBottom:"8px"}}>
          <div>
            <p style={{fontSize:"11px",color:T.muted,fontWeight:600,marginBottom:"3px"}}>{moduleTitle}</p>
            <h3 style={{fontFamily:T.dFont,fontSize:"17px",fontWeight:800,color:T.text,lineHeight:1.25}}>{lesson.title}</h3>
          </div>
          <LessonStatusBadge status={status}/>
        </div>
        <p style={{fontSize:"12px",color:T.muted,lineHeight:1.5,marginBottom:"10px"}}>{lesson.description}</p>

        {/* RAG notice */}
        {hasRag && (
          <div style={{
            display:"flex",alignItems:"center",gap:"8px",
            background:"#FFF8E1",border:"1.5px solid #F59E0B44",
            borderRadius:"8px",padding:"8px 12px",marginBottom:"10px",
          }}>
            <span style={{fontSize:"14px"}}>📄</span>
            <div>
              <p style={{fontSize:"12px",fontWeight:700,color:"#92400E"}}>Teacher materials will be used</p>
              <p style={{fontSize:"11px",color:"#B45309"}}>AI will pull from your uploaded course documents via RAG when generating this lesson.</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
          {status==="idle"&&(
            <button className="btn btn-p btn-sm" onClick={onGenerate}>
              ✦ Generate Lesson
            </button>
          )}
          {status==="generating"&&(
            <button className="btn btn-p btn-sm" disabled style={{opacity:.7}}>
              <Spinner size={14} color="#fff"/> Generating…
            </button>
          )}
          {status==="done"&&(
            <button className="btn btn-sm btn-outline" onClick={onRegenerate}>
              ↺ Regenerate
            </button>
          )}
          {status==="error"&&(
            <button className="btn btn-p btn-sm" onClick={onGenerate} style={{background:T.error}}>
              Retry ↺
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {status==="done"&&(
        <>
          <div style={{display:"flex",borderBottom:`2px solid ${T.border}`,background:T.white}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                flex:1,padding:"12px 8px",border:"none",
                borderBottom:`3px solid ${tab===t.id?T.primary:"transparent"}`,
                background:"none",cursor:"pointer",
                fontFamily:T.bFont,fontSize:"13px",fontWeight:tab===t.id?700:500,
                color:tab===t.id?T.primary:T.muted,
                transition:"all .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",
              }}>
                {t.label}
                {t.count>0&&<span style={{
                  background:tab===t.id?T.primary:T.border,
                  color:tab===t.id?"#fff":T.muted,
                  borderRadius:"999px",padding:"1px 7px",fontSize:"11px",fontWeight:700,
                }}>{t.count}</span>}
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
            {tab==="slides"&&(
              <>
                <p style={{fontSize:"12px",color:T.muted,marginBottom:"12px",fontWeight:500}}>
                  Edit slides freely — changes are saved locally. Generate the next lesson when you're satisfied.
                </p>
                {slides.map((sl,i)=>(
                  <SlideCard key={i} slide={sl} index={i} onChange={updated=>onSaveSlide(i,updated)}/>
                ))}
                {slides.length===0&&<p style={{color:T.mutedL,fontSize:"13px",textAlign:"center",padding:"20px 0"}}>No slides generated.</p>}
              </>
            )}
            {tab==="tasks"&&(
              <>
                <p style={{fontSize:"12px",color:T.muted,marginBottom:"12px",fontWeight:500}}>
                  Tasks will be saved as drafts and assigned to enrolled students.
                </p>
                {tasks.map((t,i)=><TaskCard key={i} task={t} index={i}/>)}
                {tasks.length===0&&<p style={{color:T.mutedL,fontSize:"13px",textAlign:"center",padding:"20px 0"}}>No tasks generated.</p>}
              </>
            )}
            {tab==="test"&&(
              <>
                <p style={{fontSize:"12px",color:T.muted,marginBottom:"12px",fontWeight:500}}>
                  {questions.length} multiple-choice questions · review before publishing.
                </p>
                {questions.map((q,i)=><QuestionCard key={i} q={q} index={i}/>)}
                {questions.length===0&&<p style={{color:T.mutedL,fontSize:"13px",textAlign:"center",padding:"20px 0"}}>No test questions generated.</p>}
              </>
            )}
          </div>
        </>
      )}

      {/* Idle / generating states */}
      {status==="idle"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px",textAlign:"center"}}>
          <div style={{fontSize:"44px",marginBottom:"16px",opacity:.35}}>📝</div>
          <p style={{fontFamily:T.dFont,fontSize:"15px",fontWeight:700,color:T.muted,marginBottom:"6px"}}>Lesson not generated yet</p>
          <p style={{fontSize:"13px",color:T.mutedL,maxWidth:"280px",lineHeight:1.6}}>Click "Generate Lesson" above to create slides, tasks, and a test for this lesson.</p>
        </div>
      )}

      {status==="generating"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px",textAlign:"center",gap:"16px"}}>
          <Spinner size={40}/>
          <div>
            <p style={{fontFamily:T.dFont,fontSize:"15px",fontWeight:700,color:T.text,marginBottom:"6px"}}>Generating lesson…</p>
            <p style={{fontSize:"13px",color:T.muted}}>Creating slides, tasks, and test questions.{hasRag?" Using your uploaded materials.":""}</p>
          </div>
        </div>
      )}

      {status==="error"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px",textAlign:"center"}}>
          <div style={{fontSize:"36px",marginBottom:"12px"}}>⚠️</div>
          <p style={{fontFamily:T.dFont,fontSize:"15px",fontWeight:700,color:T.error}}>Generation failed</p>
          <p style={{fontSize:"13px",color:T.muted,marginTop:"6px"}}>Click "Retry" to try again.</p>
        </div>
      )}
    </div>
  );
};

/* ─── API: single lesson content ─────────────────────────────────────────── */
async function fetchLessonContent(lesson, moduleTitle, outline, courseData) {
  const prompt = `Generate complete lesson content for ONE lesson only.

Course: "${outline.course_title}" — ${courseData.subject} ${courseData.level}
Module: "${moduleTitle}"
Lesson: "${lesson.title}"
Lesson description: "${lesson.description}"
Students' native language: ${courseData.nativeLanguage}

IMPORTANT: Use any teacher-uploaded course materials available for this lesson/module
through the RAG pipeline (pre-ingested unit documents). Prioritise that content for
slides and examples; fall back to general knowledge if no RAG content is available.

Return ONLY valid JSON:
{
  "slides": [
    { "order": 1, "title": "Slide title", "content": "Rich instructional content for this slide (2-4 sentences)" }
  ],
  "tasks": [
    { "title": "Task title", "description": "Clear student instructions", "type": "written" }
  ],
  "test": {
    "title": "Lesson Test — ${lesson.title}",
    "questions": [
      {
        "prompt_rich": "Question text in ${courseData.nativeLanguage}",
        "options": ["option1", "option2", "option3", "option4"],
        "correct_answer": "exact text of the correct option verbatim",
        "explanation_rich": "One sentence explanation"
      }
    ]
  }
}

Rules:
- 3-4 slides
- 1-2 tasks (type: "written" or "gap_fill")
- 4-5 test questions (multiple choice, 4 options each)
- All content at ${courseData.level} proficiency level
- Instructions/questions in ${courseData.nativeLanguage}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      messages: [{ role:"user", content: prompt }],
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
export default function CourseBuildScreen({ outline, courseData, uploadedFiles, onFinish }) {
  const [currentLessonId,         setCurrentLessonId]         = useState(null);
  const [generatedLessons,        setGeneratedLessons]        = useState({});
  const [lessonGenerationStatus,  setLessonGenerationStatus]  = useState({});
  const [openModules,             setOpenModules]             = useState(() => {
    // All modules open by default
    const init = {};
    (outline?.modules||[]).forEach(m => { init[m.id] = true; });
    return init;
  });

  const modules  = outline?.modules || [];
  const flag     = {Italian:"🇮🇹",Spanish:"🇪🇸",French:"🇫🇷",English:"🇬🇧"}[courseData.subject]||"📚";

  // Assume RAG is available if teacher uploaded files during onboarding
  const hasGlobalRag = uploadedFiles && uploadedFiles.length > 0;

  // Count totals
  const totalLessons   = modules.reduce((a,m) => a + (m.lessons?.length||0), 0);
  const doneLessons    = Object.values(lessonGenerationStatus).filter(s=>s==="done").length;
  const anyDone        = doneLessons > 0;

  // Flat lookup: lessonId -> { lesson, module }
  const lessonMap = {};
  modules.forEach(mod => {
    (mod.lessons||[]).forEach(les => {
      lessonMap[les.id] = { lesson: les, module: mod };
    });
  });

  const currentEntry = currentLessonId ? lessonMap[currentLessonId] : null;

  /* ── generateLessonContent ───────────────────────────────────────────── */
  const generateLessonContent = useCallback(async (lessonId) => {
    const entry = lessonMap[lessonId];
    if (!entry) return;

    setLessonGenerationStatus(s => ({ ...s, [lessonId]: "generating" }));
    setCurrentLessonId(lessonId);

    try {
      const result = await fetchLessonContent(
        entry.lesson,
        entry.module.title,
        outline,
        courseData,
      );
      setGeneratedLessons(prev => ({
        ...prev,
        [lessonId]: { ...result, editedSlides: result.slides },
      }));
      setLessonGenerationStatus(s => ({ ...s, [lessonId]: "done" }));
    } catch (e) {
      setLessonGenerationStatus(s => ({ ...s, [lessonId]: "error" }));
    }
  }, [outline, courseData]);

  /* ── saveLessonEdits ─────────────────────────────────────────────────── */
  const saveLessonEdits = useCallback((lessonId, slideIndex, updatedSlide) => {
    setGeneratedLessons(prev => {
      const lesson = prev[lessonId];
      if (!lesson) return prev;
      const editedSlides = [...(lesson.editedSlides || lesson.slides || [])];
      editedSlides[slideIndex] = updatedSlide;
      return { ...prev, [lessonId]: { ...lesson, editedSlides } };
    });
  }, []);

  const toggleModule = id => setOpenModules(s => ({ ...s, [id]: !s[id] }));

  return (
    <div style={{
      minHeight: "100vh",
      background: `radial-gradient(ellipse 80% 40% at 50% -5%,${T.primary}12,transparent),${T.bg}`,
      display: "flex", flexDirection: "column",
    }}>

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <div style={{
        background: T.white, borderBottom: `2px solid ${T.border}`,
        padding: "0 24px", display:"flex", alignItems:"center",
        justifyContent:"space-between", height: 60, flexShrink: 0,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{
            width:36,height:36,borderRadius:"12px",
            background:`linear-gradient(135deg,${T.primary},#8B6FFF)`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:"18px",
          }}>🎓</div>
          <div>
            <p style={{fontSize:"13px",fontWeight:800,color:T.text,fontFamily:T.dFont,lineHeight:1.2}}>{outline?.course_title||`${courseData.subject} ${courseData.level}`}</p>
            <p style={{fontSize:"11px",color:T.muted}}>{flag} {courseData.subject} · {courseData.level} · {courseData.nativeLanguage}</p>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          {/* Progress indicator */}
          <div style={{display:"flex",alignItems:"center",gap:"8px",background:T.primaryL,borderRadius:"10px",padding:"7px 14px"}}>
            <div style={{width:80,height:6,background:T.border,borderRadius:999,overflow:"hidden"}}>
              <div style={{height:"100%",background:`linear-gradient(90deg,${T.primary},#8B6FFF)`,borderRadius:999,width:totalLessons>0?`${(doneLessons/totalLessons)*100}%`:"0%",transition:"width .5s"}}/>
            </div>
            <span style={{fontSize:"12px",fontWeight:700,color:T.primary}}>{doneLessons}/{totalLessons} lessons</span>
          </div>

          {anyDone && (
            <button className="btn btn-p btn-sm" onClick={onFinish} style={{background:`linear-gradient(135deg,${T.primary},#8B5CF6)`}}>
              Go to dashboard →
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{
        flex:1, display:"flex", gap:"0", minHeight:0,
        maxWidth:"1400px", width:"100%", margin:"0 auto", padding:"20px 24px",
        boxSizing:"border-box",
      }}>

        {/* ── Left: outline tree ──────────────────────────────────────── */}
        <div style={{
          width:"320px", flexShrink:0, marginRight:"20px",
          display:"flex", flexDirection:"column", gap:"8px",
          overflowY:"auto",
        }}>
          {/* Header */}
          <div style={{
            background:T.white, border:`2px solid ${T.border}`,
            borderRadius:"14px", padding:"14px 16px", marginBottom:"4px",
          }}>
            <p style={{fontFamily:T.dFont,fontSize:"14px",fontWeight:800,color:T.text,marginBottom:"4px"}}>Course Outline</p>
            <p style={{fontSize:"12px",color:T.muted,lineHeight:1.5}}>{outline?.description}</p>
          </div>

          {/* RAG global notice */}
          {hasGlobalRag && (
            <div style={{
              background:"#FFF8E1", border:"1.5px solid #F59E0B44",
              borderRadius:"12px", padding:"10px 14px",
              display:"flex", alignItems:"center", gap:"8px",
            }}>
              <span style={{fontSize:"18px"}}>📄</span>
              <div>
                <p style={{fontSize:"12px",fontWeight:700,color:"#92400E"}}>Materials uploaded</p>
                <p style={{fontSize:"11px",color:"#B45309"}}>{uploadedFiles.length} file{uploadedFiles.length>1?"s":""} — AI uses them for each lesson.</p>
              </div>
            </div>
          )}

          {/* Modules */}
          {modules.map((mod, mi) => {
            const isOpen   = !!openModules[mod.id];
            const lessons  = mod.lessons || [];
            const modDone  = lessons.filter(l => lessonGenerationStatus[l.id]==="done").length;

            return (
              <div key={mod.id} className={`module-row ${isOpen?"open":""}`}>
                {/* Module header */}
                <button
                  onClick={() => toggleModule(mod.id)}
                  style={{
                    width:"100%", display:"flex", alignItems:"center", gap:"10px",
                    padding:"12px 14px", background:"none", border:"none",
                    cursor:"pointer", textAlign:"left",
                  }}
                >
                  <div style={{
                    width:26,height:26,borderRadius:"8px",
                    background:T.primaryL, color:T.primary,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontFamily:T.dFont,fontSize:"11px",fontWeight:800,flexShrink:0,
                  }}>M{mi+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:"13px",fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mod.title}</p>
                    <p style={{fontSize:"10px",color:T.muted}}>{modDone}/{lessons.length} lessons done</p>
                  </div>
                  <span style={{fontSize:"14px",color:T.muted,transition:"transform .2s",transform:isOpen?"rotate(90deg)":"none"}}>›</span>
                </button>

                {/* Lesson list */}
                {isOpen && lessons.map((les) => {
                  const status = lessonGenerationStatus[les.id] || "idle";
                  const isCurrent = currentLessonId === les.id;

                  return (
                    <div
                      key={les.id}
                      className={`lesson-row ${isCurrent?"selected":""}`}
                      onClick={() => setCurrentLessonId(les.id)}
                    >
                      {/* Status dot */}
                      <div style={{
                        width:10,height:10,borderRadius:"50%",flexShrink:0,
                        background: status==="done"?T.green : status==="generating"?T.primary : status==="error"?T.error : T.border,
                        animation: status==="generating"?"pulse 1s infinite":"none",
                      }}/>

                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:"13px",fontWeight:isCurrent?700:500,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{les.title}</p>
                        {hasGlobalRag && <RagBadge/>}
                      </div>

                      {/* Generate button (inline, only for idle) */}
                      {status==="idle" && (
                        <button
                          className="btn btn-xs btn-p"
                          onClick={e=>{ e.stopPropagation(); generateLessonContent(les.id); }}
                        >
                          ✦ Generate
                        </button>
                      )}
                      {status==="generating" && <Spinner size={14}/>}
                      {status==="done"        && <span style={{fontSize:"14px",color:T.green}}>✓</span>}
                      {status==="error"       && <span style={{fontSize:"14px",color:T.error}}>✗</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Finish CTA at bottom of sidebar */}
          {anyDone && (
            <div style={{
              background: T.white, border:`2px solid ${T.border}`,
              borderRadius:"14px", padding:"14px 16px",
              animation:"fadeUp .4s both",
            }}>
              <p style={{fontSize:"12px",color:T.muted,marginBottom:"10px",lineHeight:1.5}}>
                {doneLessons===totalLessons
                  ? "🎉 All lessons generated! Review and head to the dashboard."
                  : `${doneLessons} of ${totalLessons} lessons ready. You can go to dashboard now or generate more.`
                }
              </p>
              <button
                className="btn btn-p btn-sm"
                onClick={onFinish}
                style={{width:"100%",justifyContent:"center",background:`linear-gradient(135deg,${T.primary},#8B5CF6)`}}
              >
                Open dashboard 🚀
              </button>
            </div>
          )}
        </div>

        {/* ── Right: lesson editor ─────────────────────────────────────── */}
        <LessonEditor
          lesson      = {currentEntry?.lesson     || null}
          moduleTitle = {currentEntry?.module.title || ""}
          lessonData  = {currentLessonId ? generatedLessons[currentLessonId] : null}
          status      = {currentLessonId ? (lessonGenerationStatus[currentLessonId]||"idle") : "idle"}
          hasRag      = {hasGlobalRag}
          onGenerate  = {()=>generateLessonContent(currentLessonId)}
          onRegenerate= {()=>generateLessonContent(currentLessonId)}
          onSaveSlide = {(idx,updated)=>saveLessonEdits(currentLessonId,idx,updated)}
        />
      </div>
    </div>
  );
}