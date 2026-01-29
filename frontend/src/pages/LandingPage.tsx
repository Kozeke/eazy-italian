import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Play,
  BookOpen,
  CheckCircle,
  Users,
  ArrowRight,
  Globe,
  Target,
  Star,
  Award,
  TrendingUp,
  Clock,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

const LandingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = [
    {
      icon: <Play className="w-6 h-6 text-purple-600" />,
      title: t('landing.benefits.interactive'),
      description: t('landing.benefits.interactiveDesc'),
    },
    {
      icon: <Users className="w-6 h-6 text-purple-600" />,
      title: t('landing.benefits.expert'),
      description: t('landing.benefits.expertDesc'),
    },
    {
      icon: <Award className="w-6 h-6 text-purple-600" />,
      title: t('landing.benefits.progress'),
      description: t('landing.benefits.progressDesc'),
    },
    {
      icon: <Clock className="w-6 h-6 text-purple-600" />,
      title: t('landing.benefits.personalized'),
      description: t('landing.benefits.personalizedDesc'),
    },
  ];

  const testimonialsData = {
    ru: [
      {
        name: 'Анна Смирнова',
        role: 'Студентка',
        rating: 5,
        text: 'Отличная платформа для изучения итальянского! За 3 месяца я прошла с нулевого уровня до A2.',
        avatar: 'AS'
      },
      {
        name: 'Дмитрий Петров',
        role: 'Бизнесмен',
        rating: 5,
        text: 'Идеально для занятых людей! Могу учиться в любое время, уроки короткие и эффективные.',
        avatar: 'ДП'
      },
      {
        name: 'Елена Волкова',
        role: 'Переводчик',
        rating: 5,
        text: 'Прекрасная методика! Особенно понравились видео с носителями языка.',
        avatar: 'ЕВ'
      },
    ],
    en: [
      {
        name: 'Anna Smirnova',
        role: 'Student',
        rating: 5,
        text: 'Excellent platform for learning Italian! In 3 months I went from zero level to A2.',
        avatar: 'AS'
      },
      {
        name: 'Dmitry Petrov',
        role: 'Businessman',
        rating: 5,
        text: 'Perfect for busy people! I can study anytime, lessons are short and effective.',
        avatar: 'DP'
      },
      {
        name: 'Elena Volkova',
        role: 'Translator',
        rating: 5,
        text: 'Excellent methodology! I especially liked the videos with native speakers.',
        avatar: 'EV'
      },
    ],
  };

  const testimonials = testimonialsData[currentLang as 'ru' | 'en'] || testimonialsData.ru;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Globe className="w-8 h-8 text-purple-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">
                EZ Italian
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-sm text-gray-700 hover:text-gray-900">
                {t('landing.nav.features') || 'Features'}
              </a>
              <a href="#pricing" className="text-sm text-gray-700 hover:text-gray-900">
                {t('landing.nav.pricing') || 'Pricing'}
              </a>
              <button
                onClick={() => i18n.changeLanguage(currentLang === 'ru' ? 'en' : 'ru')}
                className="text-sm text-gray-700 hover:text-gray-900"
              >
                {currentLang === 'ru' ? 'EN' : 'RU'}
              </button>
            </nav>

            <div className="hidden md:flex items-center space-x-4">
              <Link
                to="/login"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {t('auth.login')}
              </Link>
              <Link
                to="/register"
                className="bg-purple-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-purple-700 transition-colors"
              >
                {t('auth.register')}
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-gray-700" />
              ) : (
                <Menu className="w-6 h-6 text-gray-700" />
              )}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200">
              <div className="flex flex-col space-y-3">
                <a href="#features" className="text-sm text-gray-700 hover:text-gray-900">
                  {t('landing.nav.features') || 'Features'}
                </a>
                <a href="#pricing" className="text-sm text-gray-700 hover:text-gray-900">
                  {t('landing.nav.pricing') || 'Pricing'}
                </a>
                <button
                  onClick={() => i18n.changeLanguage(currentLang === 'ru' ? 'en' : 'ru')}
                  className="text-sm text-gray-700 hover:text-gray-900 text-left"
                >
                  {currentLang === 'ru' ? 'English' : 'Русский'}
                </button>
                <Link
                  to="/login"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {t('auth.login')}
                </Link>
                <Link
                  to="/register"
                  className="bg-purple-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-purple-700 transition-colors text-center"
                >
                  {t('auth.register')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gray-50 py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                {t('landing.hero.title') || 'Learn Italian Online'}
              </h1>
              <p className="text-lg md:text-xl text-gray-600 mb-8">
                {t('landing.hero.subtitle') ||
                  'Master Italian with interactive video lessons, exercises, and tests. Learn at your own pace.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/register"
                  className="bg-purple-600 text-white px-8 py-4 rounded font-semibold hover:bg-purple-700 transition-colors text-center"
                >
                  {t('landing.hero.cta') || 'Get Started'}
                </Link>
                <Link
                  to="/login"
                  className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded font-semibold hover:border-gray-400 transition-colors text-center"
                >
                  {t('landing.hero.secondaryCta') || 'Sign In'}
                </Link>
              </div>
              <div className="mt-8 flex items-center gap-8 text-sm text-gray-600">
                <div>
                  <div className="font-bold text-2xl text-gray-900">5,000+</div>
                  <div>{t('landing.stats.students') || 'Students'}</div>
                </div>
                <div>
                  <div className="font-bold text-2xl text-gray-900">200+</div>
                  <div>{t('landing.stats.lessons') || 'Lessons'}</div>
                </div>
                <div>
                  <div className="font-bold text-2xl text-gray-900">4.9/5</div>
                  <div>{t('landing.stats.rating') || 'Rating'}</div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white rounded-lg shadow-xl p-8 border border-gray-200">
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                  <Play className="w-16 h-16 text-purple-600" />
                </div>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="flex items-center gap-2 pt-2">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <span className="text-sm text-gray-600">4.9 (1,200 reviews)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.features.title') || 'Why Learn With Us'}
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {t('landing.features.subtitle') ||
                'Everything you need to master Italian in one place'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.testimonials.title') || 'What Students Say'}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-lg border border-gray-200"
              >
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div className="ml-3">
                    <div className="font-semibold text-gray-900">
                      {testimonial.name}
                    </div>
                    <div className="text-sm text-gray-600">{testimonial.role}</div>
                  </div>
                </div>
                <div className="flex mb-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                </div>
                <p className="text-gray-700 text-sm">{testimonial.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.pricing.title') || 'Choose Your Plan'}
            </h2>
            <p className="text-lg text-gray-600">
              {t('landing.pricing.subtitle') || 'Start learning today'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="border-2 border-gray-200 rounded-lg p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {t('landing.pricing.free') || 'Free'}
              </h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">
                  {currentLang === 'ru' ? '0₽' : '$0'}
                </span>
                <span className="text-gray-600 ml-2">
                  {t('landing.pricing.perMonth') || '/month'}
                </span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.freeFeatures.feature1') || '10 basic lessons'}</span>
                </li>
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.freeFeatures.feature2') || 'Basic exercises'}</span>
                </li>
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.freeFeatures.feature3') || 'Community access'}</span>
                </li>
              </ul>
              <Link
                to="/register"
                className="block w-full text-center py-3 px-6 border-2 border-gray-300 rounded font-semibold text-gray-700 hover:border-gray-400 transition-colors"
              >
                {t('landing.pricing.chooseFree') || 'Get Started'}
              </Link>
            </div>

            {/* Premium Plan */}
            <div className="border-2 border-purple-600 rounded-lg p-8 relative shadow-lg">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-purple-600 text-white px-4 py-1 rounded-full text-xs font-semibold">
                  {t('landing.pricing.popular') || 'Most Popular'}
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {t('landing.pricing.premium') || 'Premium'}
              </h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">
                  {currentLang === 'ru' ? '2,990₽' : '$39'}
                </span>
                <span className="text-gray-600 ml-2">
                  {t('landing.pricing.perMonth') || '/month'}
                </span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.premiumFeatures.feature1') || 'All lessons'}</span>
                </li>
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.premiumFeatures.feature2') || 'Interactive exercises'}</span>
                </li>
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.premiumFeatures.feature3') || 'Progress tracking'}</span>
                </li>
                {/* <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.premiumFeatures.feature4') || 'Certificates'}</span>
                </li> */}
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.premiumFeatures.feature5') || 'Priority support'}</span>
                </li>
              </ul>
              <Link
                to="/register"
                className="block w-full text-center py-3 px-6 bg-purple-600 text-white rounded font-semibold hover:bg-purple-700 transition-colors"
              >
                {t('landing.pricing.choosePremium') || 'Get Started'}
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="border-2 border-gray-200 rounded-lg p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {t('landing.pricing.pro') || 'Pro'}
              </h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">
                  {currentLang === 'ru' ? '5,990₽' : '$79'}
                </span>
                <span className="text-gray-600 ml-2">
                  {t('landing.pricing.perMonth') || '/month'}
                </span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.proFeatures.feature1') || 'Everything in Premium'}</span>
                </li>
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.proFeatures.feature2') || '1-on-1 tutoring'}</span>
                </li>
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.proFeatures.feature3') || 'Custom learning path'}</span>
                </li>
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.proFeatures.feature4') || 'Exam preparation'}</span>
                </li>
                <li className="flex items-start text-sm text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{t('landing.pricing.proFeatures.feature5') || 'Lifetime access'}</span>
                </li>
              </ul>
              <Link
                to="/register"
                className="block w-full text-center py-3 px-6 border-2 border-gray-300 rounded font-semibold text-gray-700 hover:border-gray-400 transition-colors"
              >
                {t('landing.pricing.choosePro') || 'Get Started'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-purple-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {t('landing.cta.title') || 'Ready to Start Learning?'}
          </h2>
          <p className="text-lg text-purple-100 mb-8">
            {t('landing.cta.subtitle') ||
              'Join thousands of students learning Italian online'}
          </p>
          <Link
            to="/register"
            className="inline-flex items-center bg-white text-purple-600 px-8 py-4 rounded font-semibold hover:bg-gray-100 transition-colors"
          >
            {t('landing.cta.button') || 'Get Started for Free'}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-white font-semibold mb-4">
                {t('landing.footer.product') || 'Product'}
              </h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.lessons') || 'Lessons'}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.tests') || 'Tests'}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.certificates') || 'Certificates'}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">
                {t('landing.footer.support') || 'Support'}
              </h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.help') || 'Help Center'}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.faq') || 'FAQ'}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.contact') || 'Contact'}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">
                {t('landing.footer.company') || 'Company'}
              </h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.about') || 'About'}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.blog') || 'Blog'}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    {t('landing.footer.careers') || 'Careers'}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <div className="flex items-center mb-4">
                <Globe className="w-6 h-6 text-purple-400" />
                <span className="ml-2 text-white font-bold">Eazy Italian</span>
              </div>
              <p className="text-sm">{t('landing.footer.description')}</p>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>
              © {new Date().getFullYear()} Eazy Italian.{' '}
              {t('landing.footer.copyright') || 'All rights reserved.'}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;