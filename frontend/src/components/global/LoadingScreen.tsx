import React, { useEffect, useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Quote {
  text: string;
  attribution?: string;
}

// ─── Quote database ───────────────────────────────────────────────────────────
// ~20 quotes per language. Mix of proverbs, science facts, and wisdom.
// Keys match i18next language codes (also matched via prefix).

const QUOTES: Record<string, Quote[]> = {
  en: [
    { text: "A different language is a different vision of life.", attribution: "Federico Fellini" },
    { text: "Just 15 minutes of practice a day can help you learn a new language in 2 years." },
    { text: "The limits of my language mean the limits of my world.", attribution: "Ludwig Wittgenstein" },
    { text: "To learn a language is to have one more window from which to look at the world.", attribution: "Chinese proverb" },
    { text: "People who speak two languages earn on average 5–20% more than monolinguals." },
    { text: "Repetition is the mother of learning." },
    { text: "Learning a second language delays Alzheimer's by an average of 4.5 years." },
    { text: "The more languages you know, the more of a person you are.", attribution: "Czech proverb" },
    { text: "You live a new life for every language you speak.", attribution: "Czech proverb" },
    { text: "Language is the road map of a culture.", attribution: "Rita Mae Brown" },
    { text: "The brain physically grows new grey matter when you learn a second language." },
    { text: "One language sets you in a corridor for life. Two languages open every door.", attribution: "Frank Smith" },
    { text: "Babies learn their first language through massive repetition — so can you." },
    { text: "Language is the dress of thought.", attribution: "Samuel Johnson" },
    { text: "Consistent learners — even just 5 minutes a day — outperform cramming sessions." },
    { text: "Every word you learn today is a bridge to someone else's world." },
    { text: "He who knows no foreign languages knows nothing of his own.", attribution: "Goethe" },
    { text: "The best time to start learning was yesterday. The second best time is now." },
    { text: "Bilinguals are better at multitasking and filtering out distractions." },
    { text: "Small daily progress beats occasional bursts of effort." },
  ],

  ru: [
    { text: "Повторение — мать учения." },
    { text: "Сколько языков ты знаешь — столько раз ты человек.", attribution: "Чешская пословица" },
    { text: "Учить язык — значит видеть мир в новом свете." },
    { text: "Всего 15 минут в день — и через 2 года ты говоришь на новом языке." },
    { text: "Знание иностранного языка повышает зарплату в среднем на 10–20%." },
    { text: "Язык — это зеркало культуры.", attribution: "Эдуард Сепир" },
    { text: "Изучение второго языка задерживает болезнь Альцгеймера на 4,5 года." },
    { text: "Капля камень точит. Каждый урок приближает тебя к цели." },
    { text: "Не стыдно не знать — стыдно не учиться." },
    { text: "Мозг буквально растёт, когда ты учишь новый язык." },
    { text: "Живи, пока можешь учиться; живи, пока можешь жить.", attribution: "Сенека" },
    { text: "Дорогу осилит идущий." },
    { text: "Язык — это одежда мысли.", attribution: "Сэмюэл Джонсон" },
    { text: "Регулярные занятия по 5 минут эффективнее редких, но долгих." },
    { text: "Двуязычные люди лучше справляются с многозадачностью." },
    { text: "Каждое новое слово сегодня — это мост к чьему-то миру." },
    { text: "Знать несколько языков — значит иметь несколько душ.", attribution: "Карл Великий" },
    { text: "Учение в детстве — как резьба на камне; учение в старости — как письмо на воде." },
    { text: "Тот, кто не знает иностранных языков, ничего не знает о своём.", attribution: "Гёте" },
    { text: "Маленький прогресс каждый день ведёт к большим результатам." },
  ],

  it: [
    { text: "Repetita iuvant — la ripetizione aiuta.", attribution: "Proverbio latino" },
    { text: "Una lingua diversa è una visione diversa della vita.", attribution: "Federico Fellini" },
    { text: "Chi sa due lingue vale due persone.", attribution: "Proverbio italiano" },
    { text: "Solo 15 minuti al giorno possono farti imparare una nuova lingua in 2 anni." },
    { text: "Il linguaggio è la veste del pensiero.", attribution: "Samuel Johnson" },
    { text: "Imparare una seconda lingua ritarda l'Alzheimer di 4,5 anni in media." },
    { text: "Il cervello cresce fisicamente quando impari una nuova lingua." },
    { text: "Ogni parola nuova è un ponte verso il mondo di qualcun altro." },
    { text: "L'apprendimento costante, anche solo 5 minuti al giorno, batte lo studio a crampo." },
    { text: "Le lingue sono il passaporto verso il mondo.", attribution: "Proverbio" },
    { text: "Chi parla due lingue guadagna in media il 10–20% in più." },
    { text: "Non c'è vergogna nel non sapere; la vergogna è nel non imparare." },
    { text: "Il viaggio di mille miglia inizia con un singolo passo.", attribution: "Lao Tzu" },
    { text: "Quante lingue conosci, tante volte sei persona.", attribution: "Proverbio ceco" },
    { text: "La lingua è lo specchio dell'anima." },
    { text: "Chi non conosce le lingue straniere non sa nulla della propria.", attribution: "Goethe" },
    { text: "Ogni giorno senza imparare è un giorno perso.", attribution: "Proverbio" },
    { text: "I bilingui sono migliori nel multitasking e nel filtrare le distrazioni." },
    { text: "La cultura è la forma superiore della comunicazione." },
    { text: "Piccolo progresso ogni giorno porta a grandi risultati." },
  ],

  de: [
    { text: "Wer fremde Sprachen nicht kennt, weiß nichts von seiner eigenen.", attribution: "Goethe" },
    { text: "Wiederholung ist die Mutter des Lernens." },
    { text: "Eine andere Sprache ist eine andere Sichtweise auf das Leben.", attribution: "Federico Fellini" },
    { text: "So viele Sprachen du sprichst, so viele Male bist du Mensch.", attribution: "Tschechisches Sprichwort" },
    { text: "Schon 15 Minuten täglich können dir in 2 Jahren eine neue Sprache beibringen." },
    { text: "Das Gehirn wächst buchstäblich, wenn du eine neue Sprache lernst." },
    { text: "Zweisprachige Menschen verdienen im Schnitt 10–20% mehr." },
    { text: "Das Erlernen einer zweiten Sprache verzögert Alzheimer um 4,5 Jahre." },
    { text: "Sprache ist das Kleid des Gedankens.", attribution: "Samuel Johnson" },
    { text: "Übung macht den Meister." },
    { text: "Kleine tägliche Fortschritte führen zu großen Ergebnissen." },
    { text: "Jedes neue Wort heute ist eine Brücke zur Welt von jemand anderem." },
    { text: "Beständige Lernende übertreffen Bulimie-Lernende." },
    { text: "Die Sprache ist der Spiegel der Kultur." },
    { text: "Man lernt nie aus." },
    { text: "Zweisprachige sind besser im Multitasking und können Ablenkungen besser filtern." },
    { text: "Wer nicht wagt, der nicht gewinnt." },
    { text: "Sprachen zu kennen bedeutet, mehrere Seelen zu haben.", attribution: "Karl der Große" },
    { text: "Der beste Zeitpunkt zu beginnen war gestern. Der zweitbeste ist jetzt." },
    { text: "Eine Sprache eröffnet einen Korridor; zwei Sprachen öffnen jede Tür." },
  ],

  fr: [
    { text: "La répétition est la mère de l'apprentissage." },
    { text: "Une autre langue, c'est une autre vision de la vie.", attribution: "Federico Fellini" },
    { text: "Autant de langues tu parles, autant de fois tu es une personne.", attribution: "Proverbe tchèque" },
    { text: "Seulement 15 minutes par jour peuvent t'apprendre une nouvelle langue en 2 ans." },
    { text: "Le cerveau grandit physiquement quand on apprend une nouvelle langue." },
    { text: "Les bilingues gagnent en moyenne 10 à 20 % de plus que les monolingues." },
    { text: "Apprendre une deuxième langue retarde l'Alzheimer de 4,5 ans en moyenne." },
    { text: "La langue est le vêtement de la pensée.", attribution: "Samuel Johnson" },
    { text: "Celui qui ne connaît pas les langues étrangères ne connaît rien de la sienne.", attribution: "Goethe" },
    { text: "La langue est le miroir de la culture." },
    { text: "Chaque mot appris aujourd'hui est un pont vers le monde de quelqu'un d'autre." },
    { text: "Un apprentissage régulier, même 5 minutes par jour, surpasse le bachotage." },
    { text: "Les bilingues sont meilleurs pour le multitâche et filtrer les distractions." },
    { text: "Il n'y a pas de honte à ne pas savoir ; la honte est de ne pas apprendre." },
    { text: "Parler une autre langue, c'est vivre une autre vie.", attribution: "Proverbe tchèque" },
    { text: "Le savoir est la seule chose qui s'accroît quand on le partage." },
    { text: "Petit à petit, l'oiseau fait son nid." },
    { text: "Connaître plusieurs langues signifie avoir plusieurs âmes.", attribution: "Charlemagne" },
    { text: "La meilleure façon de prédire l'avenir est de le construire." },
    { text: "Un petit progrès chaque jour mène à de grands résultats." },
  ],

  es: [
    { text: "La repetición es la madre del aprendizaje." },
    { text: "Una lengua diferente es una visión diferente de la vida.", attribution: "Federico Fellini" },
    { text: "Cuantos más idiomas sepas, más veces eres persona.", attribution: "Proverbio checo" },
    { text: "Solo 15 minutos al día pueden enseñarte un nuevo idioma en 2 años." },
    { text: "El cerebro crece físicamente cuando aprendes un nuevo idioma." },
    { text: "Los bilingües ganan en promedio un 10–20% más que los monolingües." },
    { text: "Aprender un segundo idioma retrasa el Alzheimer 4,5 años de promedio." },
    { text: "El idioma es el vestido del pensamiento.", attribution: "Samuel Johnson" },
    { text: "Quien no conoce lenguas extranjeras, nada sabe de la suya.", attribution: "Goethe" },
    { text: "El idioma es el espejo de la cultura." },
    { text: "Cada palabra que aprendes hoy es un puente hacia el mundo de alguien más." },
    { text: "El aprendizaje constante, aunque sean 5 minutos al día, supera las sesiones de estudio intensivo." },
    { text: "Los bilingües son mejores en multitarea y en filtrar distracciones." },
    { text: "No hay vergüenza en no saber; la vergüenza es en no aprender." },
    { text: "Querer es poder." },
    { text: "Hablar otro idioma es vivir otra vida.", attribution: "Proverbio checo" },
    { text: "Saber varios idiomas significa tener varias almas.", attribution: "Carlomagno" },
    { text: "El mejor momento para empezar fue ayer. El segundo mejor es ahora." },
    { text: "Poco a poco se va lejos." },
    { text: "Un pequeño progreso cada día lleva a grandes resultados." },
  ],

  uk: [
    { text: "Повторення — мати навчання." },
    { text: "Скільки мов знаєш — стільки разів ти людина.", attribution: "Чеське прислів'я" },
    { text: "Вчити мову — це бачити світ у новому світлі." },
    { text: "Лише 15 хвилин на день — і за 2 роки ти говориш новою мовою." },
    { text: "Знання іноземної мови підвищує зарплату на 10–20%." },
    { text: "Мозок буквально росте, коли вчиш нову мову." },
    { text: "Вивчення другої мови затримує хворобу Альцгеймера на 4,5 роки." },
    { text: "Краплі камінь точать. Кожен урок наближає тебе до мети." },
    { text: "Не соромно не знати — соромно не вчитися." },
    { text: "Мова — це дзеркало культури." },
    { text: "Терпіння і труд усе перетруть." },
    { text: "Двомовні люди краще справляються з багатозадачністю." },
    { text: "Кожне нове слово сьогодні — це міст до чийогось світу." },
    { text: "Хто не знає іноземних мов, нічого не знає про свою.", attribution: "Ґете" },
    { text: "Регулярні заняття по 5 хвилин ефективніші за рідкісні, але довгі." },
    { text: "Маленький прогрес щодня призводить до великих результатів." },
    { text: "Знати кілька мов означає мати кілька душ.", attribution: "Карл Великий" },
    { text: "Найкращий час для початку був учора. Другий найкращий — зараз." },
    { text: "Дорогу здолає той, хто йде." },
    { text: "Мова — одяг думки.", attribution: "Семюел Джонсон" },
  ],

  pl: [
    { text: "Powtarzanie jest matką nauki." },
    { text: "Ile języków znasz, tyle razy jesteś człowiekiem.", attribution: "Czeskie przysłowie" },
    { text: "Uczyć się języka to widzieć świat w nowym świetle." },
    { text: "Zaledwie 15 minut dziennie może nauczyć cię nowego języka w 2 lata." },
    { text: "Znajomość języków obcych zwiększa zarobki średnio o 10–20%." },
    { text: "Mózg dosłownie rośnie, gdy uczysz się nowego języka." },
    { text: "Nauka drugiego języka opóźnia Alzheimera o 4,5 roku." },
    { text: "Język to lustro kultury." },
    { text: "Kto nie zna języków obcych, nie wie nic o swoim własnym.", attribution: "Goethe" },
    { text: "Regularne zajęcia po 5 minut są skuteczniejsze niż rzadkie, ale długie." },
    { text: "Każde nowe słowo to most do czyjegoś świata." },
    { text: "Małymi krokami dochodzi się daleko." },
    { text: "Osoby dwujęzyczne lepiej radzą sobie z wielozadaniowością." },
    { text: "Najlepszy czas na start był wczoraj. Drugi najlepszy to teraz." },
    { text: "Cierpliwość i praca wszystko pokona." },
    { text: "Nie ma wstydu w niewiedzeniu; wstyd jest w nieuczeniu się." },
    { text: "Język jest ubraniem myśli.", attribution: "Samuel Johnson" },
    { text: "Znajomość kilku języków oznacza posiadanie kilku dusz.", attribution: "Karol Wielki" },
    { text: "Mały postęp każdego dnia prowadzi do wielkich wyników." },
    { text: "Chcieć to móc." },
  ],

  tr: [
    { text: "Tekrar, öğrenmenin anasıdır." },
    { text: "Kaç dil bilirsen o kadar insansın.", attribution: "Çek atasözü" },
    { text: "Dil öğrenmek, dünyayı yeni bir gözle görmektir." },
    { text: "Günde sadece 15 dakika ile 2 yılda yeni bir dil öğrenebilirsin." },
    { text: "İkinci bir dil öğrenmek Alzheimer'ı ortalama 4,5 yıl geciktirir." },
    { text: "Yeni bir dil öğrenince beyin gerçekten büyüyor." },
    { text: "İki dil bilenler, tek dil bilenlere göre %10–20 daha fazla kazanıyor." },
    { text: "Dil, kültürün aynasıdır." },
    { text: "Yabancı dil bilmeyen, kendi dilini de bilmez.", attribution: "Goethe" },
    { text: "Her gün küçük bir ilerleme, büyük sonuçlara götürür." },
    { text: "Sabır ve çalışma her şeyi yener." },
    { text: "Başlamak için en iyi zaman dündü. İkinci en iyi zaman şimdi." },
    { text: "İki dil konuşmak iki hayat yaşamak demektir.", attribution: "Çek atasözü" },
    { text: "Dil, düşüncenin giysisidir.", attribution: "Samuel Johnson" },
    { text: "İki dilli insanlar çoklu görevde daha başarılıdır." },
    { text: "Azimle çalışmak, her kapıyı açar." },
    { text: "Bugün öğrenilen her kelime başka bir dünyaya açılan kapıdır." },
    { text: "Damla damla göl olur." },
    { text: "Birkaç dil bilmek birkaç ruha sahip olmak demektir.", attribution: "Charlemagne" },
    { text: "Düzenli 5 dakikalık çalışmalar, seyrek ama uzun seanslardan daha etkilidir." },
  ],

  ar: [
    { text: "التكرار يُعلِّم الشطار." },
    { text: "تعلُّم لغة جديدة يعني رؤية العالم بعيون مختلفة." },
    { text: "كلما تعلمت لغةً أكثر، كلما أصبحت إنساناً أكثر.", attribution: "مثل تشيكي" },
    { text: "15 دقيقة يوميًا يمكن أن تُعلِّمك لغةً جديدة في غضون عامين." },
    { text: "اللغة مرآة الثقافة." },
    { text: "تعلُّم لغة ثانية يؤخر الإصابة بالزهايمر بمعدل 4.5 سنوات." },
    { text: "الدماغ ينمو نمواً فعلياً عند تعلُّم لغة جديدة." },
    { text: "من لا يعرف لغة أجنبية لا يعرف شيئاً عن لغته.", attribution: "غوته" },
    { text: "اللغة هي لباس الفكر.", attribution: "صاموئيل جونسون" },
    { text: "المُثابَرة مفتاح النجاح." },
    { text: "كل كلمة تتعلمها اليوم جسرٌ نحو عالم شخص آخر." },
    { text: "العلم في الصغر كالنقش في الحجر." },
    { text: "ثنائيو اللغة أفضل في تعدد المهام." },
    { text: "اطلب العلم من المهد إلى اللحد." },
    { text: "التقدم اليومي الصغير يقود إلى نتائج كبيرة." },
    { text: "أفضل وقت للبدء كان بالأمس. ثاني أفضل وقت هو الآن." },
    { text: "تعلُّم عدة لغات يعني امتلاك عدة أرواح.", attribution: "شارلمان" },
    { text: "من جدَّ وجد، ومن زرع حصد." },
    { text: "الجلسات المنتظمة لمدة 5 دقائق أفعل من الجلسات الطويلة النادرة." },
    { text: "لكل لغة نافذة ترى العالم من خلالها." },
  ],

  zh: [
    { text: "温故而知新。", attribution: "孔子" },
    { text: "学习一门语言，就是拥有一扇通向世界的窗。", attribution: "中国谚语" },
    { text: "知识没有国界，语言是开门的钥匙。" },
    { text: "每天只需 15 分钟，两年内就能学会一门新语言。" },
    { text: "学习第二语言可以将阿尔茨海默症推迟约 4.5 年。" },
    { text: "大脑在学习新语言时会真正地生长。" },
    { text: "双语者的多任务处理能力更强。" },
    { text: "会说几种语言，就拥有几种人生。", attribution: "捷克谚语" },
    { text: "语言是思想的衣裳。", attribution: "塞缪尔·约翰逊" },
    { text: "不知外语者，对本国语言也一无所知。", attribution: "歌德" },
    { text: "千里之行，始于足下。", attribution: "老子" },
    { text: "每天进步一点，终将成就大事。" },
    { text: "会说双语的人比只会一门语言的人平均多赚 10–20%。" },
    { text: "每个今天学到的新词，都是通往别人世界的桥梁。" },
    { text: "熟能生巧。" },
    { text: "学而不思则罔，思而不学则殆。", attribution: "孔子" },
    { text: "坚持每天练习 5 分钟，比偶尔长时间学习更有效。" },
    { text: "开始的最佳时机是昨天，其次是现在。" },
    { text: "懂几门语言，就拥有几个灵魂。", attribution: "查理曼大帝" },
    { text: "语言是文化的镜子。" },
  ],

  ja: [
    { text: "継続は力なり。" },
    { text: "言語は文化の鏡である。" },
    { text: "一日15分の練習で、2年間で新しい言語を習得できる。" },
    { text: "第二言語を学ぶことで、アルツハイマー病を平均4.5年遅らせられる。" },
    { text: "脳は新しい言語を学ぶと実際に成長する。" },
    { text: "二言語話者はマルチタスクが得意である。" },
    { text: "知る言語の数だけ、人生が広がる。", attribution: "チェコのことわざ" },
    { text: "言語は思想の衣である。", attribution: "サミュエル・ジョンソン" },
    { text: "外国語を知らない者は、自国語についても何も知らない。", attribution: "ゲーテ" },
    { text: "七転び八起き。" },
    { text: "始める最善の時は昨日だった。次善の時は今だ。" },
    { text: "毎日少しずつの進歩が、大きな結果につながる。" },
    { text: "今日学んだ一つの単語が、誰かの世界への架け橋になる。" },
    { text: "二言語話者は平均して一言語話者より10〜20%多く稼ぐ。" },
    { text: "石の上にも三年。" },
    { text: "習うより慣れろ。" },
    { text: "複数の言語を知ることは、複数の魂を持つことだ。", attribution: "シャルルマーニュ" },
    { text: "規則正しい5分間の練習は、まれな長いセッションより効果的だ。" },
    { text: "千里の道も一歩から。", attribution: "老子" },
    { text: "学んで時に之を習う、亦た説ばしからずや。", attribution: "孔子" },
  ],

  ko: [
    { text: "반복은 학습의 어머니다." },
    { text: "언어는 문화의 거울이다." },
    { text: "하루 15분만으로 2년 안에 새로운 언어를 배울 수 있다." },
    { text: "제2언어 학습은 알츠하이머를 평균 4.5년 지연시킨다." },
    { text: "새로운 언어를 배울 때 뇌가 실제로 성장한다." },
    { text: "이중 언어 사용자는 멀티태스킹에 더 능숙하다." },
    { text: "알고 있는 언어의 수만큼 더 많은 사람이 될 수 있다.", attribution: "체코 속담" },
    { text: "언어는 생각의 옷이다.", attribution: "새뮤얼 존슨" },
    { text: "외국어를 모르는 사람은 자국어에 대해서도 아무것도 모른다.", attribution: "괴테" },
    { text: "천 리 길도 한 걸음부터." },
    { text: "시작하기 가장 좋은 때는 어제였다. 두 번째는 지금이다." },
    { text: "매일 조금씩 발전하면 큰 결과를 이끌어낼 수 있다." },
    { text: "오늘 배운 단어 하나하나가 누군가의 세계로 가는 다리가 된다." },
    { text: "이중 언어 사용자는 단일 언어 사용자보다 평균 10~20% 더 많이 번다." },
    { text: "꾸준한 5분 연습이 가끔 하는 긴 공부보다 효과적이다." },
    { text: "여러 언어를 아는 것은 여러 개의 영혼을 가지는 것이다.", attribution: "샤를마뉴" },
    { text: "호랑이도 제 말 하면 온다." },
    { text: "배움에는 끝이 없다." },
    { text: "넘어져도 일어서면 된다." },
    { text: "작은 노력이 쌓여 큰 성취가 된다." },
  ],

  pt: [
    { text: "A repetição é a mãe do aprendizado." },
    { text: "Uma língua diferente é uma visão diferente da vida.", attribution: "Federico Fellini" },
    { text: "Quantas línguas você fala, tantas vezes você é uma pessoa.", attribution: "Provérbio tcheco" },
    { text: "Apenas 15 minutos por dia podem te ensinar um novo idioma em 2 anos." },
    { text: "O cérebro cresce fisicamente quando você aprende uma nova língua." },
    { text: "Bilingues ganham em média 10–20% a mais que monolíngues." },
    { text: "Aprender um segundo idioma atrasa o Alzheimer em 4,5 anos em média." },
    { text: "A língua é o espelho da cultura." },
    { text: "Quem não conhece línguas estrangeiras não sabe nada da sua própria.", attribution: "Goethe" },
    { text: "Cada palavra aprendida hoje é uma ponte para o mundo de alguém." },
    { text: "Devagar se vai ao longe." },
    { text: "Querer é poder." },
    { text: "Os bilingues são melhores em multitarefa e em filtrar distrações." },
    { text: "O melhor momento para começar foi ontem. O segundo melhor é agora." },
    { text: "A língua é a roupa do pensamento.", attribution: "Samuel Johnson" },
    { text: "Conhecer várias línguas significa ter várias almas.", attribution: "Carlos Magno" },
    { text: "Pequenos progressos diários levam a grandes resultados." },
    { text: "A persistência é o caminho do êxito.", attribution: "Charles Chaplin" },
    { text: "Falar outra língua é viver outra vida.", attribution: "Provérbio tcheco" },
    { text: "O aprendizado constante supera o estudo intensivo esporádico." },
  ],
};

// Fallback to English if locale not found
const getFallbackLocale = (lang: string): string => {
  const prefix = lang.split("-")[0].toLowerCase();
  if (QUOTES[prefix]) return prefix;
  return "en";
};

// ─── Quote picker — avoids repetition ────────────────────────────────────────
// Stores the last N shown indices in sessionStorage per locale so we don't
// repeat until the pool is (nearly) exhausted.

const STORAGE_KEY = "lngai_shown_quotes";
const MIN_GAP = 8; // minimum quotes between repeats

function getShownMap(): Record<string, number[]> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveShownMap(map: Record<string, number[]>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function pickQuote(lang: string): Quote {
  const locale = getFallbackLocale(lang);
  const pool = QUOTES[locale] ?? QUOTES.en;
  const map = getShownMap();
  const shown: number[] = map[locale] ?? [];

  // Find indices not recently shown
  const available = pool
    .map((_, i) => i)
    .filter((i) => !shown.slice(-Math.min(MIN_GAP, pool.length - 1)).includes(i));

  const idx =
    available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : Math.floor(Math.random() * pool.length);

  // Update history
  const updated = [...shown, idx].slice(-(pool.length - 1));
  saveShownMap({ ...map, [locale]: updated });

  return pool[idx];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LoadingScreenProps {
  /** When true, the screen fades out and unmounts after the transition */
  isLoading: boolean;
  /** i18n language code, e.g. "en", "ru", "it-IT" — defaults to browser language */
  lang?: string;
}

/**
 * Full-viewport loading screen shown during app bootstrap / auth resolution.
 * Displays a motivational quote under the logo, localised to the user's language.
 * Uses a session-based anti-repetition mechanism so the user sees variety.
 *
 * Integration example (App.tsx / root layout):
 *
 *   const { loading, user } = useAuth();
 *   const { i18n } = useTranslation();
 *   return (
 *     <>
 *       <LoadingScreen isLoading={loading} lang={i18n.language} />
 *       {!loading && <RouterOutlet />}
 *     </>
 *   );
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({ isLoading, lang }) => {
  const [visible, setVisible] = useState(true);
  const quoteRef = useRef<Quote | null>(null);

  // Pick once on mount and never change — prevents flicker on re-renders
  if (!quoteRef.current) {
    const detectedLang =
      lang ??
      (typeof navigator !== "undefined" ? navigator.language : "en");
    quoteRef.current = pickQuote(detectedLang);
  }

  const quote = quoteRef.current;

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setVisible(false), 420);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [isLoading]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&display=swap');

        .lngai-loading-screen {
          position: fixed;
          top: 0; left: 0;
          width: 100vw;
          min-height: 100vh;
          height: 100dvh;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
          background: #F7F7FA;
          opacity: 1;
          overflow: hidden;
          transition: opacity 380ms cubic-bezier(0.4, 0, 0.2, 1);
          will-change: opacity;
        }
        .lngai-loading-screen.lngai-fade-out {
          opacity: 0;
          pointer-events: none;
        }

        /* ── ambient aurora: soft drifting blobs give the screen organic life ── */
        .lngai-aurora {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .lngai-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(64px);
          will-change: transform;
        }
        .lngai-blob-1 {
          width: 380px; height: 380px;
          background: radial-gradient(circle at 50% 50%, rgba(108,111,239,0.26) 0%, rgba(108,111,239,0) 70%);
          top: 10%; left: 50%;
          margin-left: -300px;
          animation: lngai-drift-1 16s ease-in-out infinite;
        }
        .lngai-blob-2 {
          width: 320px; height: 320px;
          background: radial-gradient(circle at 50% 50%, rgba(155,158,245,0.24) 0%, rgba(155,158,245,0) 70%);
          bottom: 12%; left: 50%;
          margin-left: 40px;
          animation: lngai-drift-2 19s ease-in-out infinite;
        }
        @keyframes lngai-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(34px, 26px) scale(1.08); }
        }
        @keyframes lngai-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-28px, -22px) scale(1.1); }
        }

        /* ── stage: keeps logo + quote breathing together as one unit ── */
        .lngai-stage {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: lngai-breathe 6s ease-in-out infinite;
        }
        @keyframes lngai-breathe {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }

        /* soft halo that grounds the logo into the background rather than floating */
        .lngai-logo-wrap {
          position: relative;
          display: flex;
          justify-content: center;
        }
        .lngai-logo-halo {
          position: absolute;
          top: 50%; left: 50%;
          width: 280px; height: 170px;
          transform: translate(-50%, -50%);
          background: radial-gradient(ellipse at center, rgba(108,111,239,0.15) 0%, rgba(108,111,239,0) 68%);
          pointer-events: none;
          z-index: 0;
        }

        /* ── orbit ── */
        .lngai-logo-svg {
          position: relative;
          z-index: 1;
          display: block;
          margin: 0 auto;
        }
        .lngai-orbit-ring {
          transform-origin: 20px 20px;
          animation: lngai-orbit 3.6s linear infinite;
        }
        .lngai-dot-counter {
          transform-box: fill-box;
          transform-origin: center;
          animation: lngai-counter 3.6s linear infinite;
        }
        @keyframes lngai-orbit  { to { transform: rotate(360deg);  } }
        @keyframes lngai-counter { to { transform: rotate(-360deg); } }

        .lngai-outer-ring {
          animation: lngai-ring-pulse 3.6s ease-in-out infinite;
          transform-origin: 20px 20px;
          transform-box: fill-box;
        }
        @keyframes lngai-ring-pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1;    }
        }

        .lngai-wordmark {
          animation: lngai-wm-enter 0.7s ease both;
        }
        @keyframes lngai-wm-enter {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);   }
        }

        /* ── connective stem: a hairline that visually ties the logo to the quote ── */
        .lngai-stem {
          width: 1px;
          height: 32px;
          background: linear-gradient(180deg, rgba(108,111,239,0) 0%, rgba(108,111,239,0.4) 100%);
          margin-top: 8px;
          transform-origin: top;
          animation: lngai-stem-grow 0.9s 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes lngai-stem-grow {
          from { opacity: 0; transform: scaleY(0); }
          to   { opacity: 1; transform: scaleY(1); }
        }

        /* ── quote: borderless & centered so it reads as part of the whole ── */
        .lngai-quote {
          margin-top: 14px;
          max-width: 360px;
          width: calc(100vw - 56px);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          animation: lngai-quote-enter 0.9s 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes lngai-quote-enter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .lngai-quote-mark {
          font-family: 'Georgia', 'Times New Roman', serif;
          font-size: 34px;
          line-height: 0.5;
          color: #6C6FEF;
          opacity: 0.26;
          margin-bottom: 8px;
          user-select: none;
        }
        .lngai-quote-text {
          font-family: 'Inter', -apple-system, system-ui, sans-serif;
          font-size: 14.5px;
          line-height: 1.62;
          color: #3A3D6A;
          font-style: italic;
          margin: 0;
          text-wrap: balance;
        }
        .lngai-quote-attr {
          margin-top: 13px;
          font-family: 'Inter', -apple-system, system-ui, sans-serif;
          font-size: 11px;
          color: #9093B8;
          font-style: normal;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 9px;
        }
        .lngai-quote-attr::before,
        .lngai-quote-attr::after {
          content: '';
          width: 18px;
          height: 1px;
          background: #C9CBEA;
          flex-shrink: 0;
        }

        /* respect users who prefer less motion */
        @media (prefers-reduced-motion: reduce) {
          .lngai-stage, .lngai-blob-1, .lngai-blob-2 { animation: none; }
        }
      `}</style>

      <div
        className={`lngai-loading-screen${!isLoading ? " lngai-fade-out" : ""}`}
        role="status"
        aria-label="Loading LinguAI"
        aria-live="polite"
      >
        {/* ── ambient aurora backdrop ──────────────────────────────────── */}
        <div className="lngai-aurora" aria-hidden="true">
          <span className="lngai-blob lngai-blob-1" />
          <span className="lngai-blob lngai-blob-2" />
        </div>

        {/* ── stage: logo, stem and quote breathe together as one piece ── */}
        <div className="lngai-stage">
          <div className="lngai-logo-wrap">
            {/* halo grounds the logo into the page background */}
            <span className="lngai-logo-halo" aria-hidden="true" />

            {/* ── Logo SVG ────────────────────────────────────────────────── */}
            <svg
            className="lngai-logo-svg"
            width="216"
            height="48"
            viewBox="0 0 180 40"
            fill="none"
            overflow="visible"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle
              className="lngai-outer-ring"
              cx="20" cy="20" r="17"
              stroke="#6C6FEF" strokeWidth="1.6"
            />
            <circle
              cx="20" cy="20" r="9"
              stroke="#6C6FEF" strokeWidth="1.1" opacity="0.4"
            />
            <circle cx="20" cy="20" r="3" fill="#6C6FEF" />

            <g className="lngai-orbit-ring">
              <circle className="lngai-dot-counter" cx="20"   cy="3"    r="2" fill="#6C6FEF" opacity="0.75" />
              <circle className="lngai-dot-counter" cx="34.7" cy="11.5" r="2" fill="#6C6FEF" opacity="0.75" />
              <circle className="lngai-dot-counter" cx="34.7" cy="28.5" r="2" fill="#6C6FEF" opacity="0.75" />
            </g>

            <g className="lngai-wordmark">
              <text
                x="48" y="26"
                fontFamily="'Syne', system-ui, sans-serif"
                fontWeight="700" fontSize="19"
                fill="#1A1A2E" letterSpacing="-0.5"
              >Lingu</text>
              <text
                x="106" y="26"
                fontFamily="'Syne', system-ui, sans-serif"
                fontWeight="700" fontSize="19"
                fill="#6C6FEF" letterSpacing="-0.5"
              >AI</text>
            </g>
          </svg>
          </div>

          {/* hairline that ties the logo down to the quote */}
          <span className="lngai-stem" aria-hidden="true" />

          {/* ── Motivational quote ───────────────────────────────────────── */}
          <figure className="lngai-quote" aria-hidden="true">
            <span className="lngai-quote-mark">"</span>
            <p className="lngai-quote-text">{quote.text}</p>
            {quote.attribution && (
              <figcaption className="lngai-quote-attr">{quote.attribution}</figcaption>
            )}
          </figure>
        </div>

        {/* Screen-reader live text */}
        <span
          style={{
            position: "absolute", width: 1, height: 1,
            padding: 0, margin: -1, overflow: "hidden",
            clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
          }}
        >
          Loading…
        </span>
      </div>
    </>
  );
};

export default LoadingScreen;