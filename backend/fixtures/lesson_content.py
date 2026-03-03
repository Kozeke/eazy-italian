"""
fixtures/lesson_content.py
============================
Sample lesson content for RAG ingestion testing.

Structure mirrors the real DB:
  course_id = 1  → "Italian for Beginners" (English)
  course_id = 2  → "Итальянский для начинающих" (Russian)

  lesson_id = 1  → Present Tense (-are verbs)
  lesson_id = 2  → Present Tense (-ere / -ire verbs)
  lesson_id = 3  → Articles (definite & indefinite)
  lesson_id = 4  → Numbers 1–100
  lesson_id = 5  → (RU) Настоящее время — глаголы на -are
"""

LESSONS = [
    # ──────────────────────────────────────────────────────────────────────────
    # Lesson 1 — Present tense: -are verbs (English)
    # ──────────────────────────────────────────────────────────────────────────
    {
        "course_id": 1,
        "lesson_id": 1,
        "title": "Present Tense: -are Verbs",
        "language": "en",
        "text": """
Italian verbs that end in -are belong to the first conjugation group.
This is the largest verb group in Italian and includes everyday verbs
like parlare (to speak), mangiare (to eat), lavorare (to work),
studiare (to study), and abitare (to live/reside).

To conjugate a regular -are verb in the present tense (indicativo presente),
remove the infinitive ending -are and add the following endings:

  io         → -o       (I)            e.g. parlo     I speak
  tu         → -i       (you, informal) e.g. parli     you speak
  lui/lei    → -a       (he/she)        e.g. parla     he/she speaks
  noi        → -iamo    (we)            e.g. parliamo  we speak
  voi        → -ate     (you plural)    e.g. parlate   you all speak
  loro       → -ano     (they)          e.g. parlano   they speak

Example: mangiare (to eat)
  io mangio     — I eat / I am eating
  tu mangi      — you eat
  lui mangia    — he eats
  noi mangiamo  — we eat
  voi mangiate  — you all eat
  loro mangiano — they eat

Important spelling rules for -are verbs:
1. Verbs ending in -care and -gare (e.g. cercare, pagare) add an 'h'
   before the -i ending (tu cerchi, voi cercate) to keep the hard sound.
2. Verbs ending in -ciare and -giare (e.g. mangiare, cominciare) drop
   the 'i' before endings that begin with 'i' (tu mangi, not tu mangii).
3. Verbs ending in -iare with a stressed 'i' (e.g. sciare) keep the 'i'
   (tu scii).

Common irregular -are verbs you must memorise:
  andare  (to go)   → vado, vai, va, andiamo, andate, vanno
  fare    (to do)   → faccio, fai, fa, facciamo, fate, fanno
  stare   (to stay) → sto, stai, sta, stiamo, state, stanno
  dare    (to give) → do, dai, dà, diamo, date, danno

The present tense in Italian covers three English meanings:
  parlo = I speak / I am speaking / I do speak.
There is no separate progressive tense for ongoing actions in the
same way as English "I am speaking right now" — context or the
construction stare + gerundio (sto parlando) is used for emphasis.

Practice sentences:
  Io studio l'italiano ogni giorno.    — I study Italian every day.
  Marco lavora in un ristorante.       — Marco works in a restaurant.
  Noi abitiamo a Roma.                 — We live in Rome.
  Loro mangiano la pizza stasera.      — They are eating pizza tonight.
  Tu parli molto bene!                 — You speak very well!
"""
    },

    # ──────────────────────────────────────────────────────────────────────────
    # Lesson 2 — Present tense: -ere and -ire verbs (English)
    # ──────────────────────────────────────────────────────────────────────────
    {
        "course_id": 1,
        "lesson_id": 2,
        "title": "Present Tense: -ere and -ire Verbs",
        "language": "en",
        "text": """
Italian has three main verb groups based on their infinitive endings:
-are (first conjugation), -ere (second conjugation), and -ire (third
conjugation). This lesson covers -ere and -ire verbs.

--- Second conjugation: -ere verbs ---
Common examples: credere (to believe), vivere (to live), scrivere (to write),
leggere (to read), vedere (to see), chiedere (to ask), prendere (to take).

Present tense endings for -ere verbs:
  io         → -o      e.g. credo     I believe
  tu         → -i      e.g. credi     you believe
  lui/lei    → -e      e.g. crede     he/she believes
  noi        → -iamo   e.g. crediamo  we believe
  voi        → -ete    e.g. credete   you all believe
  loro       → -ono    e.g. credono   they believe

Key irregular -ere verbs:
  essere  (to be)    → sono, sei, è, siamo, siete, sono
  avere   (to have)  → ho, hai, ha, abbiamo, avete, hanno
  sapere  (to know)  → so, sai, sa, sappiamo, sapete, sanno
  potere  (can/able) → posso, puoi, può, possiamo, potete, possono
  volere  (to want)  → voglio, vuoi, vuole, vogliamo, volete, vogliono
  dovere  (must)     → devo, devi, deve, dobbiamo, dovete, devono

--- Third conjugation: -ire verbs ---
This group splits into two sub-patterns. Most -ire verbs insert -isc-
between the stem and the ending for io/tu/lui/loro forms.

Pattern A (with -isc-, most -ire verbs):
  capire (to understand):
  io capisco, tu capisci, lui capisce,
  noi capiamo, voi capite, loro capiscono.

Other -isc- verbs: finire (to finish), preferire (to prefer),
  pulire (to clean), costruire (to build), spedire (to send).

Pattern B (without -isc-, fewer verbs):
  dormire (to sleep):
  io dormo, tu dormi, lui dorme,
  noi dormiamo, voi dormite, loro dormono.

Other no-insert verbs: partire (to leave/depart), servire (to serve),
  aprire (to open), offrire (to offer), sentire (to hear/feel).

Tip for learners: when you encounter a new -ire verb, look it up in a
dictionary to check whether it uses the -isc- pattern or not.
Capire, finire, and preferire are the most frequent -isc- verbs.
"""
    },

    # ──────────────────────────────────────────────────────────────────────────
    # Lesson 3 — Articles (English)
    # ──────────────────────────────────────────────────────────────────────────
    {
        "course_id": 1,
        "lesson_id": 3,
        "title": "Italian Articles: Definite and Indefinite",
        "language": "en",
        "text": """
Italian articles agree in gender (masculine/feminine) and number
(singular/plural) with the noun they accompany. Choosing the right
article depends on the first letter(s) of the following word.

--- Definite articles (the) ---

Masculine singular:
  il   — before most consonants:    il libro (the book), il cane (the dog)
  lo   — before s+consonant, z, ps,
          gn, x, y, pn:             lo studente, lo zaino, lo psicologo
  l'   — before a vowel:            l'amico (the friend), l'uomo (the man)

Masculine plural:
  i    — before most consonants:    i libri (the books)
  gli  — plural of lo and l':       gli studenti, gli amici, gli uomini

Feminine singular:
  la   — before all consonants:     la ragazza, la porta (the door)
  l'   — before a vowel:            l'amica (the female friend)

Feminine plural:
  le   — all feminine plural nouns: le ragazze, le amiche, le porte

--- Indefinite articles (a / an) ---

Masculine singular:
  un   — before most consonants and all vowels: un libro, un amico
  uno  — before s+consonant, z, ps, gn, x, y:  uno studente, uno zaino

Feminine singular:
  una  — before all consonants:   una ragazza, una porta
  un'  — before a vowel:          un'amica, un'ora (an hour)

There are no plural indefinite articles in Italian.
Instead, Italians use the partitive (del, della, degli, delle)
or simply omit the article: Ho amici simpatici (I have nice friends).

--- Common mistakes for English speakers ---
1. Forgetting to change the article in plural: NOT "il libri" but "i libri".
2. Using "un" before a feminine noun: NOT "un ragazza" but "una ragazza".
3. Forgetting "lo/gli" before s+consonant: NOT "il studente" but "lo studente".

--- Articles with prepositions ---
Italian definite articles combine with prepositions:
  di + il = del    a + il = al    da + il = dal
  di + lo = dello  a + lo = allo  da + lo = dallo
  di + la = della  a + la = alla  da + la = dalla
  di + i  = dei    a + i  = ai    da + i  = dai
  di + gli= degli  a + gli= agli  da + gli= dagli
  di + le = delle  a + le = alle  da + le = dalle

Example: Vado al cinema (I go to the cinema) = a + il → al.
"""
    },

    # ──────────────────────────────────────────────────────────────────────────
    # Lesson 4 — Numbers 1–100 (English)
    # ──────────────────────────────────────────────────────────────────────────
    {
        "course_id": 1,
        "lesson_id": 4,
        "title": "Numbers 1 to 100",
        "language": "en",
        "text": """
Learning Italian numbers is essential for dates, prices, ages, and time.

--- Cardinal numbers 1–20 ---
1   uno        6   sei        11  undici       16  sedici
2   due        7   sette      12  dodici       17  diciassette
3   tre        8   otto       13  tredici      18  diciotto
4   quattro    9   nove      14  quattordici  19  diciannove
5   cinque    10   dieci      15  quindici     20  venti

--- Tens 20–100 ---
20  venti      50  cinquanta   80  ottanta
30  trenta     60  sessanta    90  novanta
40  quaranta   70  settanta  100  cento

--- Compound numbers (21–99) ---
For compound numbers, attach the unit directly to the ten.
Drop the final vowel of the ten before uno and otto:
  21 = ventuno     (NOT venti + uno, drop the -i)
  28 = ventotto    (NOT venti + otto, drop the -i)
  31 = trentuno    33 = trentatré   38 = trentotto
  41 = quarantuno  48 = quarantotto
  51 = cinquantuno 58 = cinquantotto

Note: 3 (tre) becomes tré when it ends a compound number:
  23 = ventitré, 33 = trentatré, 43 = quarantatré, etc.

--- Ordinal numbers (first, second…) ---
1st  primo     6th  sesto
2nd  secondo   7th  settimo
3rd  terzo     8th  ottavo
4th  quarto    9th  nono
5th  quinto   10th  decimo

From 11th onwards: add -esimo to the cardinal (drop final vowel first):
  11th undicesimo, 20th ventesimo, 100th centesimo.

--- Practical uses ---
Age:     Ho ventitre anni.          — I am 23 years old.
Price:   Costa quarantadue euro.    — It costs 42 euros.
Time:    Sono le tre e venti.       — It is 3:20.
Date:    Il primo gennaio.          — The first of January.
Phone:   Zero, tre, tre, ...        — Digits are read individually.
"""
    },

    # ──────────────────────────────────────────────────────────────────────────
    # Lesson 5 — Настоящее время: глаголы на -are (Russian, course 2)
    # ──────────────────────────────────────────────────────────────────────────
    {
        "course_id": 2,
        "lesson_id": 5,
        "title": "Настоящее время: глаголы на -are",
        "language": "ru",
        "text": """
Глаголы первого спряжения итальянского языка оканчиваются на -are.
Это самая большая группа глаголов. Примеры: parlare (говорить),
mangiare (есть/кушать), lavorare (работать), studiare (учиться),
abitare (жить/проживать), ascoltare (слушать), camminare (ходить).

Чтобы проспрягать правильный глагол на -are в настоящем времени,
нужно убрать окончание -are и добавить личные окончания:

  io         (я)          → -o      пример: parlo     — я говорю
  tu         (ты)         → -i      пример: parli     — ты говоришь
  lui/lei    (он/она)     → -a      пример: parla     — он/она говорит
  noi        (мы)         → -iamo   пример: parliamo  — мы говорим
  voi        (вы)         → -ate    пример: parlate   — вы говорите
  loro       (они)        → -ano    пример: parlano   — они говорят

Пример спряжения глагола mangiare (кушать):
  io mangio     — я кушаю
  tu mangi      — ты кушаешь
  lui mangia    — он кушает
  noi mangiamo  — мы кушаем
  voi mangiate  — вы кушаете
  loro mangiano — они кушают

Правописание. Глаголы на -care/-gare (cercare — искать, pagare — платить)
добавляют букву 'h' перед окончаниями, начинающимися с 'i', чтобы
сохранить твёрдое произношение: tu cerchi, voi cercate.

Глаголы на -ciare/-giare (mangiare, cominciare — начинать) теряют 'i'
перед окончаниями, начинающимися с 'i': tu mangi (не tu mangii).

Неправильные глаголы на -are — обязательно выучить наизусть:
  andare  (идти)     → vado, vai, va, andiamo, andate, vanno
  fare    (делать)   → faccio, fai, fa, facciamo, fate, fanno
  stare   (стоять/   → sto, stai, sta, stiamo, state, stanno
           находиться)
  dare    (давать)   → do, dai, dà, diamo, date, danno

Важно: настоящее время в итальянском передаёт три значения английского:
  parlo = I speak / I am speaking / I do speak.
Для подчёркивания действия в момент речи используется конструкция
stare + герундий: sto parlando (я сейчас говорю).

Примеры предложений:
  Io studio l'italiano ogni giorno.    — Я учу итальянский каждый день.
  Marco lavora in un ristorante.       — Марко работает в ресторане.
  Noi abitiamo a Roma.                 — Мы живём в Риме.
  Loro mangiano la pizza stasera.      — Они едят пиццу сегодня вечером.
  Tu parli molto bene!                 — Ты говоришь очень хорошо!
"""
    },
]
