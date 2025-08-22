import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Play, 
  BookOpen, 
  CheckCircle, 
  Users, 
  ArrowRight,
  Globe,
  Target
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const { t } = useTranslation();

  const benefits = [
    {
      icon: <Play className="w-8 h-8 text-primary-600" />,
      title: t('landing.benefits.interactive'),
      description: 'Интерактивные видеоуроки с носителями языка и практическими упражнениями'
    },
    {
      icon: <BookOpen className="w-8 h-8 text-primary-600" />,
      title: t('landing.benefits.personalized'),
      description: 'Персонализированная программа обучения, адаптированная под ваш уровень'
    },
    {
      icon: <Target className="w-8 h-8 text-primary-600" />,
      title: t('landing.benefits.progress'),
      description: 'Детальное отслеживание прогресса с аналитикой и рекомендациями'
    },
    {
      icon: <Users className="w-8 h-8 text-primary-600" />,
      title: t('landing.benefits.expert'),
      description: 'Опытные преподаватели итальянского языка с сертификатами CELI'
    }
  ];

  const steps = [
    {
      number: '01',
      title: t('landing.howItWorks.step1'),
      description: 'Выберите свой текущий уровень владения итальянским языком'
    },
    {
      number: '02',
      title: t('landing.howItWorks.step2'),
      description: 'Изучайте структурированные уроки с видео и аудио материалами'
    },
    {
      number: '03',
      title: t('landing.howItWorks.step3'),
      description: 'Выполняйте практические задания и получайте обратную связь'
    },
    {
      number: '04',
      title: t('landing.howItWorks.step4'),
      description: 'Проходите тесты для закрепления знаний и получения сертификатов'
    }
  ];

  const pricingPlans = [
    {
      name: t('landing.pricing.free'),
      price: '0₽',
      period: '/месяц',
      features: [
        'Доступ к 3 базовым урокам',
        'Базовые тесты',
        'Ограниченная поддержка'
      ],
      buttonText: 'Начать бесплатно',
      popular: false
    },
    {
      name: t('landing.pricing.premium'),
      price: '2990₽',
      period: '/месяц',
      features: [
        'Полный доступ ко всем урокам',
        'Неограниченные тесты',
        'Персональный куратор',
        'Сертификаты по уровням',
        'Приоритетная поддержка'
      ],
      buttonText: 'Выбрать Premium',
      popular: true
    },
    {
      name: t('landing.pricing.pro'),
      price: '5990₽',
      period: '/месяц',
      features: [
        'Все возможности Premium',
        'Индивидуальные занятия',
        'Подготовка к экзаменам CELI',
        'Персональный план обучения',
        '24/7 поддержка'
      ],
      buttonText: 'Выбрать Pro',
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
                Смотреть демо
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
              Наша платформа предлагает современный подход к изучению итальянского языка
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
              Простой и эффективный процесс обучения
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

      {/* Pricing Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.pricing.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Выберите план, который подходит именно вам
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
                      Популярный
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

      {/* CTA Section */}
      <section className="py-20 bg-primary-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Готовы начать изучение итальянского?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Присоединяйтесь к тысячам студентов, которые уже изучают итальянский с нами
          </p>
          <Link
            to="/register"
            className="bg-white text-primary-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center"
          >
            Начать бесплатно
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
                Современная платформа для изучения итальянского языка
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Продукт</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">Уроки</a></li>
                <li><a href="#" className="hover:text-white">Тесты</a></li>
                <li><a href="#" className="hover:text-white">Сертификаты</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Поддержка</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">Помощь</a></li>
                <li><a href="#" className="hover:text-white">FAQ</a></li>
                <li><a href="#" className="hover:text-white">Контакты</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Компания</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">О нас</a></li>
                <li><a href="#" className="hover:text-white">Блог</a></li>
                <li><a href="#" className="hover:text-white">Карьера</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Eazy Italian. Все права защищены.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
