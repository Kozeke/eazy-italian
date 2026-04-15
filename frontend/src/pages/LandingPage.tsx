/**
 * LandingPage.tsx
 * Public marketing page aligned with AdminCoursesCatalog visual language.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Play, CheckCircle, Users, ArrowRight, Globe, Star, Award, Clock } from "lucide-react";
import { LinguAiLogo } from "../components/global/LinguAiLogo";

// Shares the same palette/typography family used in AdminCoursesCatalog for visual consistency.
const T = {
  violet: "#6C6FEF",
  violetL: "#EEF0FE",
  violetD: "#4F52C2",
  lime: "#0DB85E",
  white: "#FFFFFF",
  bg: "#F7F7FA",
  border: "#E8E8F0",
  text: "#18181B",
  sub: "#52525B",
  muted: "#A1A1AA",
  dFont: "'Nunito', system-ui, sans-serif",
  bFont: "'Inter', system-ui, sans-serif",
};

// Defines the landing page CSS with card surfaces, spacing, and controls matching admin catalog style.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

@keyframes land-fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes land-popIn { from { opacity: 0; transform: scale(.98); } to { opacity: 1; transform: scale(1); } }

.land-root {
  min-height: 100vh;
  background: ${T.bg};
  font-family: ${T.bFont};
  color: ${T.text};
}

.land-root *, .land-root *::before, .land-root *::after { box-sizing: border-box; }

.land-page {
  background: ${T.white};
  border-radius: 16px;
  border: 1px solid ${T.border};
  margin: 24px 10%;
  padding: 28px 34px 44px;
  box-shadow: 0 1px 4px rgba(108, 111, 239, .04);
  animation: land-fadeUp .26s both;
}

.land-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: ${T.white};
  border: 1px solid ${T.border};
  border-radius: 12px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.land-nav-links {
  display: flex;
  align-items: center;
  gap: 16px;
}

.land-link {
  text-decoration: none;
  color: ${T.sub};
  font-size: 13px;
  font-weight: 600;
  transition: color .14s;
}

.land-link:hover { color: ${T.violetD}; }

.land-btn-ghost {
  border: 1.5px solid ${T.border};
  background: ${T.white};
  color: ${T.sub};
  border-radius: 9px;
  text-decoration: none;
  padding: 8px 13px;
  font-size: 12.5px;
  font-weight: 700;
  transition: all .14s;
}

.land-btn-ghost:hover { border-color: ${T.violet}; color: ${T.violetD}; background: ${T.violetL}; }

.land-btn-primary {
  border: none;
  background: ${T.violet};
  color: ${T.white};
  border-radius: 9px;
  text-decoration: none;
  padding: 8px 14px;
  font-size: 12.5px;
  font-weight: 800;
  transition: all .14s;
  box-shadow: 0 2px 10px rgba(108, 111, 239, .2);
}

.land-btn-primary:hover { background: ${T.violetD}; transform: translateY(-1px); }

.land-section { margin-top: 20px; }

.land-hero {
  border: 1px solid ${T.border};
  border-radius: 14px;
  background: linear-gradient(135deg, #FFFFFF 0%, #F7F7FA 100%);
  padding: 24px;
  display: grid;
  grid-template-columns: 1.2fr .8fr;
  gap: 20px;
  animation: land-popIn .28s both;
}

.land-title {
  font-family: ${T.dFont};
  font-size: clamp(31px, 4vw, 52px);
  line-height: 1.08;
  margin: 0 0 14px;
  font-weight: 900;
  color: ${T.text};
}

.land-subtitle {
  margin: 0 0 20px;
  color: ${T.sub};
  font-size: 15px;
  line-height: 1.65;
  max-width: 640px;
}

.land-cta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.land-stat-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.land-stat {
  border: 1px solid ${T.border};
  border-radius: 10px;
  padding: 10px;
  background: ${T.white};
}

.land-stat-value {
  font-family: ${T.dFont};
  font-size: 20px;
  font-weight: 900;
  color: ${T.violetD};
  margin-bottom: 2px;
}

.land-stat-label {
  font-size: 12px;
  color: ${T.muted};
  font-weight: 600;
}

.land-preview {
  border: 1px solid ${T.border};
  border-radius: 12px;
  background: ${T.white};
  padding: 12px;
}

.land-preview-media {
  aspect-ratio: 16/10;
  border-radius: 9px;
  border: 1px solid ${T.border};
  background: ${T.violetL};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.land-preview-lines div {
  height: 9px;
  border-radius: 999px;
  background: #E9EAF3;
  margin-bottom: 6px;
}

.land-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.land-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.land-card {
  border: 1px solid ${T.border};
  border-radius: 12px;
  background: ${T.white};
  padding: 14px;
  animation: land-popIn .22s both;
}

.land-card:hover {
  border-color: ${T.violet};
  box-shadow: 0 4px 14px rgba(108, 111, 239, .1);
}

.land-card-ico {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: ${T.violetL};
  color: ${T.violetD};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 9px;
}

.land-card-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 800;
  color: ${T.text};
  font-family: ${T.dFont};
}

.land-card-copy {
  margin: 0;
  font-size: 12px;
  color: ${T.sub};
  line-height: 1.55;
}

.land-testimonial-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.land-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: ${T.violet};
  color: ${T.white};
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.land-stars {
  display: flex;
  gap: 3px;
  margin-bottom: 7px;
  color: #F5A623;
}

.land-pricing {
  position: relative;
  border: 1px solid ${T.border};
  border-radius: 12px;
  background: ${T.white};
  padding: 14px;
}

.land-pricing.popular {
  border-color: ${T.violet};
  box-shadow: 0 6px 22px rgba(108, 111, 239, .16);
}

.land-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  background: ${T.violetL};
  color: ${T.violetD};
  border: 1px solid rgba(108, 111, 239, .2);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.land-price {
  margin: 5px 0 10px;
  font-family: ${T.dFont};
  font-size: 32px;
  font-weight: 900;
}

.land-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.land-list-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: ${T.sub};
  font-size: 12px;
}

.land-cta-band {
  margin-top: 18px;
  border: 1px solid rgba(108, 111, 239, .14);
  border-radius: 14px;
  background: linear-gradient(135deg, ${T.violet} 0%, #878AF4 100%);
  padding: 22px;
  color: ${T.white};
  text-align: center;
}

.land-cta-title {
  margin: 0 0 8px;
  font-size: clamp(21px, 3vw, 32px);
  font-family: ${T.dFont};
  font-weight: 900;
}

.land-footer {
  margin-top: 20px;
  border-top: 1px solid ${T.border};
  padding-top: 14px;
  font-size: 12px;
  color: ${T.muted};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 1024px) {
  .land-page { margin: 16px 16px; padding: 20px; }
  .land-hero { grid-template-columns: 1fr; }
  .land-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .land-grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .land-nav { flex-wrap: wrap; position: static; }
  .land-nav-links { width: 100%; justify-content: flex-start; }
  .land-stat-grid { grid-template-columns: 1fr; }
  .land-grid-4 { grid-template-columns: 1fr; }
  .land-grid-3 { grid-template-columns: 1fr; }
}
`;

const LandingPage: React.FC = () => {
  // Provides localized copy and runtime language switching.
  const { t, i18n } = useTranslation();

  // Tracks current locale to switch pricing labels and testimonials language.
  const currentLang = i18n.language;

  // Declares the benefit cards shown in the features section.
  const features = [
    {
      icon: <Play size={20} />,
      title: t("landing.benefits.interactive"),
      description: t("landing.benefits.interactiveDesc"),
    },
    {
      icon: <Users size={20} />,
      title: t("landing.benefits.expert"),
      description: t("landing.benefits.expertDesc"),
    },
    {
      icon: <Award size={20} />,
      title: t("landing.benefits.progress"),
      description: t("landing.benefits.progressDesc"),
    },
    {
      icon: <Clock size={20} />,
      title: t("landing.benefits.personalized"),
      description: t("landing.benefits.personalizedDesc"),
    },
  ];

  // Holds localized testimonial cards so the language switch updates social proof text.
  const testimonialsData = {
    ru: [
      {
        name: "Анна Смирнова",
        role: "Студентка",
        text: "Отличная платформа для изучения итальянского! За 3 месяца я прошла с нулевого уровня до A2.",
        avatar: "AS",
      },
      {
        name: "Дмитрий Петров",
        role: "Бизнесмен",
        text: "Идеально для занятых людей! Могу учиться в любое время, уроки короткие и эффективные.",
        avatar: "ДП",
      },
      {
        name: "Елена Волкова",
        role: "Переводчик",
        text: "Прекрасная методика! Особенно понравились видео с носителями языка.",
        avatar: "ЕВ",
      },
    ],
    en: [
      {
        name: "Anna Smirnova",
        role: "Student",
        text: "Excellent platform for learning Italian! In 3 months I went from zero level to A2.",
        avatar: "AS",
      },
      {
        name: "Dmitry Petrov",
        role: "Businessman",
        text: "Perfect for busy people! I can study anytime, lessons are short and effective.",
        avatar: "DP",
      },
      {
        name: "Elena Volkova",
        role: "Translator",
        text: "Excellent methodology! I especially liked the videos with native speakers.",
        avatar: "EV",
      },
    ],
  };

  // Selects the currently active testimonial list and falls back to Russian content.
  const testimonials = testimonialsData[currentLang as "ru" | "en"] || testimonialsData.ru;

  return (
    <div className="land-root">
      <style>{CSS}</style>
      <div className="land-page">
        <header className="land-nav">
          <Link to="/" aria-label="LinguAI home">
            <LinguAiLogo height={34} showWordmark />
          </Link>
          <div className="land-nav-links">
            <a className="land-link" href="#features">
              {t("landing.nav.features") || "Features"}
            </a>
            <a className="land-link" href="#pricing">
              {t("landing.nav.pricing") || "Pricing"}
            </a>
            <button
              className="land-btn-ghost"
              type="button"
              onClick={() => i18n.changeLanguage(currentLang === "ru" ? "en" : "ru")}
            >
              {currentLang === "ru" ? "EN" : "RU"}
            </button>
            <Link className="land-btn-ghost" to="/login">
              {t("auth.login")}
            </Link>
            <Link className="land-btn-primary" to="/register">
              {t("auth.register")}
            </Link>
          </div>
        </header>

        <section className="land-section">
          <div className="land-hero">
            <div>
              <h1 className="land-title">{t("landing.hero.title") || "Learn Italian Online"}</h1>
              <p className="land-subtitle">
                {t("landing.hero.subtitle") ||
                  "Master Italian with interactive video lessons, exercises, and tests. Learn at your own pace."}
              </p>
              <div className="land-cta">
                <Link className="land-btn-primary" to="/register">
                  {t("landing.hero.cta") || "Get Started"}
                </Link>
                <Link className="land-btn-ghost" to="/login">
                  {t("landing.hero.secondaryCta") || "Sign In"}
                </Link>
              </div>
              <div className="land-stat-grid">
                <div className="land-stat">
                  <div className="land-stat-value">5,000+</div>
                  <div className="land-stat-label">{t("landing.stats.students") || "Students"}</div>
                </div>
                <div className="land-stat">
                  <div className="land-stat-value">200+</div>
                  <div className="land-stat-label">{t("landing.stats.lessons") || "Lessons"}</div>
                </div>
                <div className="land-stat">
                  <div className="land-stat-value">4.9/5</div>
                  <div className="land-stat-label">{t("landing.stats.rating") || "Rating"}</div>
                </div>
              </div>
            </div>

            <div className="land-preview">
              <div className="land-preview-media">
                <Play size={48} color={T.violetD} />
              </div>
              <div className="land-preview-lines">
                <div style={{ width: "78%" }} />
                <div style={{ width: "48%" }} />
                <div className="land-stars">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={14} fill="#F5A623" color="#F5A623" />
                  ))}
                  <span style={{ marginLeft: 6, fontSize: 12, color: T.muted }}>4.9 (1,200 reviews)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="land-section" id="features">
          <h2 className="land-title" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 8 }}>
            {t("landing.features.title") || "Why Learn With Us"}
          </h2>
          <p className="land-subtitle" style={{ marginBottom: 14 }}>
            {t("landing.features.subtitle") || "Everything you need to master Italian in one place"}
          </p>
          <div className="land-grid-4">
            {features.map((feature) => (
              <article className="land-card" key={feature.title}>
                <div className="land-card-ico">{feature.icon}</div>
                <h3 className="land-card-title">{feature.title}</h3>
                <p className="land-card-copy">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="land-section">
          <h2 className="land-title" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 14 }}>
            {t("landing.testimonials.title") || "What Students Say"}
          </h2>
          <div className="land-grid-3">
            {testimonials.map((testimonial) => (
              <article className="land-card" key={`${testimonial.name}-${testimonial.role}`}>
                <div className="land-testimonial-head">
                  <div className="land-avatar">{testimonial.avatar}</div>
                  <div>
                    <div className="land-card-title" style={{ margin: 0 }}>
                      {testimonial.name}
                    </div>
                    <div className="land-card-copy">{testimonial.role}</div>
                  </div>
                </div>
                <div className="land-stars">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={14} fill="#F5A623" color="#F5A623" />
                  ))}
                </div>
                <p className="land-card-copy">{testimonial.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="land-section" id="pricing">
          <h2 className="land-title" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 8 }}>
            {t("landing.pricing.title") || "Choose Your Plan"}
          </h2>
          <p className="land-subtitle" style={{ marginBottom: 14 }}>
            {t("landing.pricing.subtitle") || "Start learning today"}
          </p>
          <div className="land-grid-3">
            <article className="land-pricing">
              <h3 className="land-card-title">{t("landing.pricing.free") || "Free"}</h3>
              <div className="land-price">
                {currentLang === "ru" ? "0₽" : "$0"}{" "}
                <span style={{ fontSize: 13, color: T.muted }}>{t("landing.pricing.perMonth") || "/month"}</span>
              </div>
              <ul className="land-list">
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.freeFeatures.feature1") || "10 basic lessons"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.freeFeatures.feature2") || "Basic exercises"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.freeFeatures.feature3") || "Community access"}</span>
                </li>
              </ul>
              <Link className="land-btn-ghost" to="/register">
                {t("landing.pricing.chooseFree") || "Get Started"}
              </Link>
            </article>

            <article className="land-pricing popular">
              <div className="land-chip">{t("landing.pricing.popular") || "Most Popular"}</div>
              <h3 className="land-card-title">{t("landing.pricing.premium") || "Premium"}</h3>
              <div className="land-price">
                {currentLang === "ru" ? "2,990₽" : "$39"}{" "}
                <span style={{ fontSize: 13, color: T.muted }}>{t("landing.pricing.perMonth") || "/month"}</span>
              </div>
              <ul className="land-list">
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.premiumFeatures.feature1") || "All lessons"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.premiumFeatures.feature2") || "Interactive exercises"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.premiumFeatures.feature3") || "Progress tracking"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.premiumFeatures.feature5") || "Priority support"}</span>
                </li>
              </ul>
              <Link className="land-btn-primary" to="/register">
                {t("landing.pricing.choosePremium") || "Get Started"}
              </Link>
            </article>

            <article className="land-pricing">
              <h3 className="land-card-title">{t("landing.pricing.pro") || "Pro"}</h3>
              <div className="land-price">
                {currentLang === "ru" ? "5,990₽" : "$79"}{" "}
                <span style={{ fontSize: 13, color: T.muted }}>{t("landing.pricing.perMonth") || "/month"}</span>
              </div>
              <ul className="land-list">
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.proFeatures.feature1") || "Everything in Premium"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.proFeatures.feature2") || "1-on-1 tutoring"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.proFeatures.feature3") || "Custom learning path"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.proFeatures.feature4") || "Exam preparation"}</span>
                </li>
                <li className="land-list-item">
                  <CheckCircle size={14} color={T.lime} />
                  <span>{t("landing.pricing.proFeatures.feature5") || "Lifetime access"}</span>
                </li>
              </ul>
              <Link className="land-btn-ghost" to="/register">
                {t("landing.pricing.choosePro") || "Get Started"}
              </Link>
            </article>
          </div>
        </section>

        <section className="land-cta-band">
          <h2 className="land-cta-title">{t("landing.cta.title") || "Ready to Start Learning?"}</h2>
          <p style={{ margin: "0 0 14px", opacity: 0.92 }}>
            {t("landing.cta.subtitle") || "Join thousands of students learning Italian online"}
          </p>
          <Link
            className="land-btn-ghost"
            style={{ background: T.white, color: T.violetD, borderColor: "transparent", display: "inline-flex", gap: 8 }}
            to="/register"
          >
            {t("landing.cta.button") || "Get Started for Free"}
            <ArrowRight size={16} />
          </Link>
        </section>

        <footer className="land-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Globe size={16} color={T.violetD} />
            <strong style={{ color: T.sub }}>Eazy Italian</strong>
            <span>{t("landing.footer.description")}</span>
          </div>
          <span>
            © {new Date().getFullYear()} Eazy Italian. {t("landing.footer.copyright") || "All rights reserved."}
          </span>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;