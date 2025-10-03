import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { 
  Play, 
  BookOpen, 
  CheckCircle, 
  Users, 
  ArrowRight,
  Globe,
  Target,
  Star,
  Quote,
  Languages
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  const benefits = [
    {
      icon: <Play className="w-8 h-8 text-primary-600" />,
      title: t('landing.benefits.interactive'),
      description: t('landing.benefits.interactiveDesc')
    },
    {
      icon: <BookOpen className="w-8 h-8 text-primary-600" />,
      title: t('landing.benefits.personalized'),
      description: t('landing.benefits.personalizedDesc')
    },
    {
      icon: <Target className="w-8 h-8 text-primary-600" />,
      title: t('landing.benefits.progress'),
      description: t('landing.benefits.progressDesc')
    },
    {
      icon: <Users className="w-8 h-8 text-primary-600" />,
      title: t('landing.benefits.expert'),
      description: t('landing.benefits.expertDesc')
    }
  ];

  const steps = [
    {
      number: '01',
      title: t('landing.howItWorks.step1'),
      description: t('landing.howItWorks.step1Desc')
    },
    {
      number: '02',
      title: t('landing.howItWorks.step2'),
      description: t('landing.howItWorks.step2Desc')
    },
    {
      number: '03',
      title: t('landing.howItWorks.step3'),
      description: t('landing.howItWorks.step3Desc')
    },
    {
      number: '04',
      title: t('landing.howItWorks.step4'),
      description: t('landing.howItWorks.step4Desc')
    }
  ];

  const testimonialsData = {
    ru: [
      {
        name: 'Анна Смирнова',
        role: 'Студентка',
        image: '👩‍🎓',
        rating: 5,
        text: 'Отличная платформа для изучения итальянского! За 3 месяца я прошла с нулевого уровня до A2. Уроки интересные, преподаватели отзывчивые, а интерфейс очень удобный.'
      },
      {
        name: 'Дмитрий Петров',
        role: 'Бизнесмен',
        image: '👨‍💼',
        rating: 5,
        text: 'Идеально для занятых людей! Могу учиться в любое время, уроки короткие и эффективные. Через полгода смог свободно общаться во время деловой поездки в Милан.'
      },
      {
        name: 'Елена Волкова',
        role: 'Переводчик',
        image: '👩‍💻',
        rating: 5,
        text: 'Прекрасная методика! Особенно понравились видео с носителями языка и система отслеживания прогресса. Получила сертификат CELI B2 после года занятий на платформе.'
      },
      {
        name: 'Михаил Иванов',
        role: 'Учитель',
        image: '👨‍🏫',
        rating: 5,
        text: 'Я рекомендую Eazy Italian всем своим друзьям. Структурированная программа, живые диалоги и отличная поддержка от преподавателей. Это лучшая онлайн-школа итальянского!'
      },
      {
        name: 'Мария Кузнецова',
        role: 'Дизайнер',
        image: '👩‍🎨',
        rating: 5,
        text: 'Наконец-то нашла платформу, которая действительно работает! Грамматика объясняется просто и понятно, много практики разговорной речи. Сейчас готовлюсь к переезду в Италию.'
      },
      {
        name: 'Александр Соколов',
        role: 'Программист',
        image: '👨‍💻',
        rating: 5,
        text: 'Технически отличная платформа с продуманным функционалом. Мобильное приложение позволяет учиться в дороге. За 4 месяца достиг уровня B1 и теперь смотрю итальянские фильмы без субтитров!'
      }
    ],
    en: [
      {
        name: 'Anna Smirnova',
        role: 'Student',
        image: '👩‍🎓',
        rating: 5,
        text: 'Excellent platform for learning Italian! In 3 months I went from zero level to A2. The lessons are interesting, the teachers are responsive, and the interface is very user-friendly.'
      },
      {
        name: 'Dmitry Petrov',
        role: 'Businessman',
        image: '👨‍💼',
        rating: 5,
        text: 'Perfect for busy people! I can study anytime, lessons are short and effective. After six months, I was able to communicate freely during a business trip to Milan.'
      },
      {
        name: 'Elena Volkova',
        role: 'Translator',
        image: '👩‍💻',
        rating: 5,
        text: 'Excellent methodology! I especially liked the videos with native speakers and the progress tracking system. I got my CELI B2 certificate after a year of studying on the platform.'
      },
      {
        name: 'Michael Johnson',
        role: 'Teacher',
        image: '👨‍🏫',
        rating: 5,
        text: 'I recommend Eazy Italian to all my friends. Structured program, live dialogues and excellent support from teachers. This is the best online Italian school!'
      },
      {
        name: 'Maria Kuznetsova',
        role: 'Designer',
        image: '👩‍🎨',
        rating: 5,
        text: 'Finally found a platform that really works! Grammar is explained simply and clearly, lots of speaking practice. Now I\'m preparing to move to Italy.'
      },
      {
        name: 'Alexander Sokolov',
        role: 'Programmer',
        image: '👨‍💻',
        rating: 5,
        text: 'Technically excellent platform with well-thought-out functionality. The mobile app allows me to study on the go. In 4 months I reached B1 level and now I watch Italian movies without subtitles!'
      }
    ]
  };

  const testimonials = testimonialsData[currentLang as 'ru' | 'en'] || testimonialsData.ru;

  const pricingPlans = [
    {
      name: t('landing.pricing.free'),
      price: currentLang === 'ru' ? '0₽' : '$0',
      period: t('landing.pricing.perMonth'),
      features: [
        t('landing.pricing.freeFeatures.feature1'),
        t('landing.pricing.freeFeatures.feature2'),
        t('landing.pricing.freeFeatures.feature3')
      ],
      buttonText: t('landing.pricing.chooseFree'),
      popular: false
    },
    {
      name: t('landing.pricing.premium'),
      price: currentLang === 'ru' ? '2990₽' : '$39',
      period: t('landing.pricing.perMonth'),
      features: [
        t('landing.pricing.premiumFeatures.feature1'),
        t('landing.pricing.premiumFeatures.feature2'),
        t('landing.pricing.premiumFeatures.feature3'),
        t('landing.pricing.premiumFeatures.feature4'),
        t('landing.pricing.premiumFeatures.feature5')
      ],
      buttonText: t('landing.pricing.choosePremium'),
      popular: true
    },
    {
      name: t('landing.pricing.pro'),
      price: currentLang === 'ru' ? '5990₽' : '$79',
      period: t('landing.pricing.perMonth'),
      features: [
        t('landing.pricing.proFeatures.feature1'),
        t('landing.pricing.proFeatures.feature2'),
        t('landing.pricing.proFeatures.feature3'),
        t('landing.pricing.proFeatures.feature4'),
        t('landing.pricing.proFeatures.feature5')
      ],
      buttonText: t('landing.pricing.choosePro'),
      popular: false
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Globe className="w-8 h-8 text-primary-600" />
              <span className="ml-2 text-2xl font-bold text-gray-900">Eazy Italian</span>
            </div>
            <div className="flex items-center space-x-4">
              {/* Language Switcher */}
              <button 
                onClick={() => {
                  const newLang = currentLang === 'ru' ? 'en' : 'ru';
                  i18n.changeLanguage(newLang);
                }}
                className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                title={currentLang === 'ru' ? 'Switch to English' : 'Переключиться на русский'}
              >
                <Languages className="w-4 h-4" />
                <span>{currentLang === 'ru' ? 'RU' : 'EN'}</span>
              </button>
              
              <Link
                to="/login"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                {t('nav.login')}
              </Link>
              <Link
                to="/register"
                className="bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700"
              >
                {t('nav.register')}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-50 to-secondary-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              {t('landing.hero.title')}
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              {t('landing.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="bg-primary-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-primary-700 transition-colors inline-flex items-center justify-center"
              >
                {t('landing.hero.cta')}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
              <button className="border border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-50 transition-colors">
                {t('landing.hero.watchDemo')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.benefits.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('landing.benefits.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center">
                <div className="flex justify-center mb-4">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {benefit.title}
                </h3>
                <p className="text-gray-600">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.howItWorks.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('landing.howItWorks.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="bg-primary-600 text-white w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.testimonials.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('landing.testimonials.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <div className="text-4xl mr-3">{testimonial.image}</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{testimonial.name}</h4>
                    <p className="text-sm text-gray-600">{testimonial.role}</p>
                  </div>
                </div>
                <div className="flex mb-3">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <div className="relative">
                  <Quote className="absolute -top-2 -left-2 w-8 h-8 text-primary-200" />
                  <p className="text-gray-700 pl-6 italic">
                    "{testimonial.text}"
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.pricing.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('landing.pricing.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, index) => (
              <div
                key={index}
                className={`relative bg-white rounded-lg shadow-lg p-8 ${
                  plan.popular ? 'ring-2 ring-primary-600' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                      {t('landing.pricing.popular')}
                    </span>
                  </div>
                )}
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-600">{plan.period}</span>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center">
                        <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/register"
                    className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                      plan.popular
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {plan.buttonText}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-primary-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-white mb-2">5000+</div>
              <div className="text-primary-100">{t('landing.stats.students')}</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-2">200+</div>
              <div className="text-primary-100">{t('landing.stats.lessons')}</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-2">98%</div>
              <div className="text-primary-100">{t('landing.stats.satisfaction')}</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-2">15+</div>
              <div className="text-primary-100">{t('landing.stats.teachers')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {t('landing.cta.title')}
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            {t('landing.cta.subtitle')}
          </p>
          <Link
            to="/register"
            className="bg-white text-primary-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center"
          >
            {t('landing.cta.button')}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <Globe className="w-8 h-8 text-primary-400" />
                <span className="ml-2 text-xl font-bold">Eazy Italian</span>
              </div>
              <p className="text-gray-400">
                {t('landing.footer.description')}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">{t('landing.footer.product')}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">{t('landing.footer.lessons')}</a></li>
                <li><a href="#" className="hover:text-white">{t('landing.footer.tests')}</a></li>
                <li><a href="#" className="hover:text-white">{t('landing.footer.certificates')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">{t('landing.footer.support')}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">{t('landing.footer.help')}</a></li>
                <li><a href="#" className="hover:text-white">{t('landing.footer.faq')}</a></li>
                <li><a href="#" className="hover:text-white">{t('landing.footer.contact')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">{t('landing.footer.company')}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">{t('landing.footer.about')}</a></li>
                <li><a href="#" className="hover:text-white">{t('landing.footer.blog')}</a></li>
                <li><a href="#" className="hover:text-white">{t('landing.footer.careers')}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>{t('landing.footer.copyright')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
