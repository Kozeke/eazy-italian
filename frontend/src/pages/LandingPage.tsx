import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './LandingPage.css';

const LandingPage = () => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  useEffect(() => {
    // Scroll reveal
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach((el) => observer.observe(el));

    // Smooth nav hide on scroll
    let lastY = 0;
    const nav = document.querySelector('nav');
    const handleScroll = () => {
      const y = window.scrollY;
      if (nav) {
        nav.style.transform = y > lastY && y > 100 ? 'translateY(-100%)' : 'translateY(0)';
      }
      lastY = y;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div className="landing-page-wrapper">
      {/* NAV */}
      <nav>
        <a href="#" className="nav-logo">
          Teach<span>Flow</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => i18n.changeLanguage(currentLang === 'ru' ? 'en' : 'ru')}
            className="nav-lang-switcher"
          >
            {currentLang === 'ru' ? 'EN' : 'RU'}
          </button>
          <Link to="/login" className="nav-cta">
            {t('landing.teachflow.nav.startTrial')}
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-left">
          <p className="hero-eyebrow">{t('landing.teachflow.hero.eyebrow')}</p>
          <h1 className="hero-title">
            {t('landing.teachflow.hero.title')}
            <br />
            {t('landing.teachflow.hero.titleEmphasis')}
            <em>{t('landing.teachflow.hero.titleItalic')}</em>
          </h1>
          <p className="hero-subtitle">
            {t('landing.teachflow.hero.subtitle')}
          </p>
          <div className="hero-actions">
            <Link to="/login" className="btn-primary">
              {t('landing.teachflow.hero.startTrial')}
            </Link>
            <a href="#how" className="btn-ghost">
              {t('landing.teachflow.hero.seeHow')}
            </a>
          </div>
          <p className="hero-trust">{t('landing.teachflow.hero.trust')}</p>
        </div>

        <div className="hero-right">
          <div className="dashboard-mock">
            <div className="dash-bar">
              <div className="dash-dot"></div>
              <div className="dash-dot"></div>
              <div className="dash-dot"></div>
              <span className="dash-url">app.teachflow.io/dashboard</span>
            </div>
            <div className="dash-body">
              <div className="dash-header">My Courses</div>

              <div className="dash-course">
                <div className="dash-course-icon" style={{ background: 'rgba(26,112,112,0.15)' }}>
                  🇬🇧
                </div>
                <div className="dash-course-info">
                  <div className="dash-course-name">English B2 — Advanced Grammar</div>
                  <div className="dash-progress-bar">
                    <div className="dash-progress-fill" style={{ width: '78%' }}></div>
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "'Space Mono',monospace",
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  47 students
                </span>
              </div>

              <div className="dash-course">
                <div className="dash-course-icon" style={{ background: 'rgba(201,150,42,0.15)' }}>
                  🎸
                </div>
                <div className="dash-course-info">
                  <div className="dash-course-name">Guitar for Beginners</div>
                  <div className="dash-progress-bar">
                    <div
                      className="dash-progress-fill"
                      style={{ width: '55%', background: '#c9962a' }}
                    ></div>
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "'Space Mono',monospace",
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  31 students
                </span>
              </div>

              <div className="dash-course">
                <div className="dash-course-icon" style={{ background: 'rgba(201,74,42,0.15)' }}>
                  📐
                </div>
                <div className="dash-course-info">
                  <div className="dash-course-name">Math Fundamentals — Grade 8</div>
                  <div className="dash-progress-bar">
                    <div
                      className="dash-progress-fill"
                      style={{ width: '92%', background: '#c94a2a' }}
                    ></div>
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "'Space Mono',monospace",
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  28 students
                </span>
              </div>

              <div className="dash-stats">
                <div className="dash-stat">
                  <span className="dash-stat-val">106</span>
                  <div className="dash-stat-label">Students</div>
                </div>
                <div className="dash-stat">
                  <span className="dash-stat-val">94%</span>
                  <div className="dash-stat-label">Submitted</div>
                </div>
                <div className="dash-stat">
                  <span className="dash-stat-val">€1,840</span>
                  <div className="dash-stat-label">Revenue</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee-strip" aria-hidden="true">
        <div className="marquee-inner">
          <span className="marquee-item">{t('landing.teachflow.marquee.courses')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.videoLessons')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.autoGrading')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.progressTracking')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.studentAnalytics')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.assignments')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.customBranding')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.noCommissions')}</span>
          <span className="marquee-dot">◆</span>
          {/* duplicate for seamless loop */}
          <span className="marquee-item">{t('landing.teachflow.marquee.courses')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.videoLessons')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.autoGrading')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.progressTracking')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.studentAnalytics')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.assignments')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.customBranding')}</span>
          <span className="marquee-dot">◆</span>
          <span className="marquee-item">{t('landing.teachflow.marquee.noCommissions')}</span>
          <span className="marquee-dot">◆</span>
        </div>
      </div>

      {/* FEATURES */}
      <section className="features">
        <div className="reveal">
          <p className="section-label">{t('landing.teachflow.features.label')}</p>
          <h2 className="section-title">
            {t('landing.teachflow.features.title')} <em>{t('landing.teachflow.features.titleEmphasis')}</em>
          </h2>
        </div>

        <div className="features-grid">
          <div className="feature-card reveal reveal-delay-1">
            <span className="feature-icon">🏛️</span>
            <h3 className="feature-title">{t('landing.teachflow.features.ownStudents.title')}</h3>
            <p className="feature-desc">
              {t('landing.teachflow.features.ownStudents.desc')}
            </p>
            <p className="feature-desc" style={{ fontWeight: 500 }}>
              {t('landing.teachflow.features.ownStudents.desc2')}
            </p>
          </div>

          <div className="feature-card reveal reveal-delay-2">
            <span className="feature-icon">📚</span>
            <h3 className="feature-title">{t('landing.teachflow.features.courseStructure.title')}</h3>
            <p className="feature-desc">{t('landing.teachflow.features.courseStructure.desc')}</p>
            <ul className="feature-list">
              <li>{t('landing.teachflow.features.courseStructure.items.courses')}</li>
              <li>{t('landing.teachflow.features.courseStructure.items.videos')}</li>
              <li>{t('landing.teachflow.features.courseStructure.items.assignments')}</li>
              <li>{t('landing.teachflow.features.courseStructure.items.tests')}</li>
            </ul>
          </div>

          <div className="feature-card reveal reveal-delay-3">
            <span className="feature-icon">⚡</span>
            <h3 className="feature-title">{t('landing.teachflow.features.saveTime.title')}</h3>
            <p className="feature-desc">{t('landing.teachflow.features.saveTime.desc')}</p>
            <ul className="feature-list">
              <li>{t('landing.teachflow.features.saveTime.items.grading')}</li>
              <li>{t('landing.teachflow.features.saveTime.items.deadlines')}</li>
              <li>{t('landing.teachflow.features.saveTime.items.reminders')}</li>
              <li>{t('landing.teachflow.features.saveTime.items.overview')}</li>
            </ul>
          </div>

          <div className="feature-card reveal reveal-delay-4">
            <span className="feature-icon">📊</span>
            <h3 className="feature-title">{t('landing.teachflow.features.tracking.title')}</h3>
            <p className="feature-desc">{t('landing.teachflow.features.tracking.desc')}</p>
            <ul className="feature-list">
              <li>{t('landing.teachflow.features.tracking.items.watched')}</li>
              <li>{t('landing.teachflow.features.tracking.items.submitted')}</li>
              <li>{t('landing.teachflow.features.tracking.items.passed')}</li>
              <li>{t('landing.teachflow.features.tracking.items.completion')}</li>
            </ul>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-it-works" id="how">
        <div className="reveal">
          <p className="section-label">{t('landing.teachflow.howItWorks.label')}</p>
          <h2 className="section-title">
            {t('landing.teachflow.howItWorks.title')} <em>{t('landing.teachflow.howItWorks.titleEmphasis')}</em>
          </h2>
        </div>

        <div className="steps-grid">
          <div className="step reveal reveal-delay-1">
            <div className="step-num">01</div>
            <h3 className="step-title">{t('landing.teachflow.howItWorks.step1.title')}</h3>
            <p className="step-desc">
              {t('landing.teachflow.howItWorks.step1.desc')}
            </p>
          </div>

          <div className="step reveal reveal-delay-2">
            <div className="step-num">02</div>
            <h3 className="step-title">{t('landing.teachflow.howItWorks.step2.title')}</h3>
            <p className="step-desc">
              {t('landing.teachflow.howItWorks.step2.desc')}
            </p>
          </div>

          <div className="step reveal reveal-delay-3">
            <div className="step-num">03</div>
            <h3 className="step-title">{t('landing.teachflow.howItWorks.step3.title')}</h3>
            <p className="step-desc">
              {t('landing.teachflow.howItWorks.step3.desc')}
            </p>
          </div>

          <div className="step reveal reveal-delay-4">
            <div className="step-num">04</div>
            <h3 className="step-title">{t('landing.teachflow.howItWorks.step4.title')}</h3>
            <p className="step-desc">
              {t('landing.teachflow.howItWorks.step4.desc')}
            </p>
          </div>
        </div>
      </section>

      {/* FOR WHO */}
      <section className="for-who">
        <div className="reveal">
          <p className="section-label">{t('landing.teachflow.forWho.label')}</p>
          <h2 className="section-title">
            {t('landing.teachflow.forWho.title')} <em>{t('landing.teachflow.forWho.titleEmphasis')}</em>
          </h2>
          <p
            style={{
              marginTop: '1.25rem',
              color: 'var(--muted)',
              lineHeight: 1.7,
              maxWidth: '420px',
            }}
          >
            {t('landing.teachflow.forWho.subtitle')}
          </p>
        </div>

        <div className="for-who-visual reveal">
          <div className="for-who-accent"></div>
          <div className="for-who-accent-2"></div>
          <div className="for-who-card">
            <span>🌍</span>
            <span>{t('landing.teachflow.forWho.languageTeachers')}</span>
          </div>
          <div className="for-who-card">
            <span>📝</span>
            <span>{t('landing.teachflow.forWho.tutors')}</span>
          </div>
          <div className="for-who-card">
            <span>🏫</span>
            <span>{t('landing.teachflow.forWho.smallSchools')}</span>
          </div>
          <div className="for-who-card">
            <span>🎯</span>
            <span>{t('landing.teachflow.forWho.coaches')}</span>
          </div>
          <div className="for-who-card">
            <span>✨</span>
            <span>{t('landing.teachflow.forWho.personalBrand')}</span>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="reveal">
          <p className="section-label">{t('landing.teachflow.pricing.label')}</p>
          <h2 className="section-title">
            {t('landing.teachflow.pricing.title')} <em>{t('landing.teachflow.pricing.titleEmphasis')}</em>
          </h2>
        </div>

        <div className="pricing-grid">
          <div className="pricing-card reveal reveal-delay-1">
            <p className="plan-name">{t('landing.teachflow.pricing.starter.name')}</p>
            <div className="plan-price">{t('landing.teachflow.pricing.starter.price')}</div>
            <p className="plan-period">{t('landing.teachflow.pricing.starter.period')}</p>
            <ul className="plan-features">
              <li>{t('landing.teachflow.pricing.starter.students')}</li>
              <li>{t('landing.teachflow.pricing.starter.courses')}</li>
              <li>{t('landing.teachflow.pricing.starter.videos')}</li>
              <li>{t('landing.teachflow.pricing.starter.analytics')}</li>
            </ul>
            <Link to="/login" className="plan-btn">
              {t('landing.teachflow.pricing.getStarted')}
            </Link>
          </div>

          <div className="pricing-card featured reveal reveal-delay-2">
            <div className="pricing-badge">{t('landing.teachflow.pricing.professional.badge')}</div>
            <p className="plan-name">{t('landing.teachflow.pricing.professional.name')}</p>
            <div className="plan-price">{t('landing.teachflow.pricing.professional.price')}</div>
            <p className="plan-period">{t('landing.teachflow.pricing.professional.period')}</p>
            <ul className="plan-features">
              <li>{t('landing.teachflow.pricing.professional.courses')}</li>
              <li>{t('landing.teachflow.pricing.professional.students')}</li>
              <li>{t('landing.teachflow.pricing.professional.analytics')}</li>
              <li>{t('landing.teachflow.pricing.professional.branding')}</li>
            </ul>
            <Link to="/login" className="plan-btn">
              {t('landing.teachflow.pricing.getStarted')}
            </Link>
          </div>

          <div className="pricing-card reveal reveal-delay-3">
            <p className="plan-name">{t('landing.teachflow.pricing.school.name')}</p>
            <div className="plan-price">{t('landing.teachflow.pricing.school.price')}</div>
            <p className="plan-period">{t('landing.teachflow.pricing.school.period')}</p>
            <ul className="plan-features">
              <li>{t('landing.teachflow.pricing.school.students')}</li>
              <li>{t('landing.teachflow.pricing.school.teachers')}</li>
              <li>{t('landing.teachflow.pricing.school.reporting')}</li>
              <li>{t('landing.teachflow.pricing.school.support')}</li>
            </ul>
            <Link to="/login" className="plan-btn">
              {t('landing.teachflow.pricing.getStarted')}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section" id="trial">
        <h2 className="cta-big reveal">
          {t('landing.teachflow.cta.title')} <em>{t('landing.teachflow.cta.titleEmphasis')}</em>
        </h2>
        <p className="cta-sub reveal">{t('landing.teachflow.cta.subtitle')}</p>
        <div className="reveal">
          <Link to="/login" className="cta-btn">
            {t('landing.teachflow.cta.button')}
          </Link>
          <p className="cta-fine">{t('landing.teachflow.cta.fine')}</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-logo">
          Teach<span>Flow</span>
        </div>
        <div className="footer-copy">{t('landing.teachflow.footer.copyright')}</div>
      </footer>
    </div>
  );
};

export default LandingPage;
