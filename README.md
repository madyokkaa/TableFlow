# TableFlow

Сервис бронирования столиков в ресторане: визуальное бронирование для
гостей и панель администратора для персонала — управление залами,
столиками и бронями в реальном времени.

Построен на Next.js (App Router, TypeScript) и Supabase (Postgres, Auth,
Realtime, Row Level Security).

## Возможности

**Бронирование для гостя** (`/`)
- Интерактивная визуальная схема зала — стол выбирается кликом по его
  форме прямо на плане помещения
- Компактный календарь и слайдер времени с дискретными шагами (уже
  занятые слоты затемняются)
- Единый сценарий стол → дата → время → подтверждение с анимированными
  переходами между шагами
- Вход без пароля — по magic-link на почту (Supabase Auth OTP)
- Возможность бронировать анонимно, без создания аккаунта

**Панель персонала** (`/hostess`)
- Вход по email + паролю, восстановление и сброс пароля
- Управление залами и столиками, включая редактор схемы зала
  drag-and-drop (форма, диапазон мест, ручной статус «занято» /
  «не обслуживается»)
- Список броней с фильтрами, полным редактированием (время, стол,
  количество гостей, контакты, объединение нескольких столиков для
  больших компаний) и сменой статуса (подтверждена / отменена /
  неявка / завершена)
- Живые обновления через Supabase Realtime (без polling) — новая бронь
  появляется и подаёт звуковой сигнал без перезагрузки страницы
- Управление доступом сотрудников: добавление новых администраторов
  прямо из панели
- Журнал действий (`/hostess/audit`): кто и когда менял брони, залы,
  столы и доступ сотрудников. В журнал пишутся только идентификаторы и
  названия изменённых полей — без имени, телефона и email гостя. Записи
  неизменяемы (триггер запрещает `update`/`delete`/`truncate`), доступ
  только через сервисный ключ
- Двойное бронирование невозможно в принципе: ограничение Postgres
  `EXCLUDE` на пересечение стола и временного диапазона отклоняет
  конфликтующую запись на уровне базы данных, а не только в коде
  приложения

Весь интерфейс на русском языке; даты и время форматируются
соответствующим образом.

## Стек

- **Next.js 16** (App Router) + **TypeScript**, **Tailwind CSS v4**
- **Supabase**: Postgres, Auth (magic-link + email/пароль), Realtime
  (Postgres Changes), Row Level Security
- **Vitest** для интеграционных тестов (запускаются на реальном проекте
  Supabase, без моков), **Playwright** для e2e

## Быстрый старт

### 1. Проект Supabase

Создайте проект на [supabase.com](https://supabase.com), затем скопируйте
`.env.example` в `.env.local` и заполните:

```
NEXT_PUBLIC_SUPABASE_URL=          # Project Settings -> API
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Project Settings -> API
SUPABASE_SERVICE_ROLE_KEY=         # Project Settings -> API (только сервер, обходит RLS)
SUPABASE_DB_URL=                   # Project Settings -> Database -> Connection string -> Session pooler (порт 5432)
```

`SUPABASE_DB_URL` обязательно должен использовать **session pooler**
(порт 5432) — transaction pooler (6543) не гарантирует поддержку DDL из
миграций.

### 2. Установка и миграции

```bash
npm install
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

Это применит все файлы из `supabase/migrations/` по порядку: схему
(залы/столики/брони), ограничение на двойное бронирование, RPC-функции
для атомарной записи в несколько столиков и настройку Realtime-публикации.

### 3. Демо-данные (опционально)

```bash
npx tsx scripts/seed.ts
```

Создаёт два зала и несколько столиков, чтобы схема зала и доступность не
были пустыми при первом запуске.

### 4. Учётная запись сотрудника

Аккаунты персонала не создаются самостоятельно — заведите один через
дашборд Supabase (Authentication → Users → Add user, email + пароль) или
через API `supabase.auth.admin.createUser`, а затем добавьте
соответствующую запись в таблицу `staff`, чтобы `is_staff()` распознавал
пользователя. Дальше новых администраторов можно добавлять прямо из
панели персонала.

### 5. Запуск

```bash
npm run dev       # http://localhost:3000
npm run build     # production-сборка
npm run test       # все тесты (часть - на тестовом проекте Supabase, см. «Тесты и CI»)
npm run test:e2e   # e2e-тесты Playwright
npm run lint
```

## Тесты и CI

### Какие тесты что проверяют

| Файл | Нужен Supabase | Что проверяет |
| --- | --- | --- |
| `tests/auditUnit.test.ts` | нет | какие поля брони считаются изменёнными для журнала |
| `tests/bookingSlots.test.ts` | нет | сетка слотов персонала, занятые слоты |
| `tests/dashboardLive.test.ts` | нет | состояние столов на дашборде «сейчас» |
| `tests/floorPlan.test.ts` | нет | геометрия схемы зала, валидация полей зала/объектов |
| `tests/passwordStrength.test.ts` | нет | оценка надёжности пароля |
| `tests/timeZone.test.ts` | нет | часовые пояса, «сегодня» для правил брони |
| `tests/aiExtract.test.ts` | нет | ИИ-слой: запрос к Groq, валидация полей, переход на базовое решение, базовое решение на фразах kk/ru, таблица дат в поясе ресторана |
| `tests/telegramBot.test.ts` | нет | диалог бота: согласие, сводка, контакт, уточнения, занятый стол, голос, лимит, отмена |
| `tests/telegramWebhook.test.ts` | нет | вебхук: секрет, повторный `update_id` |
| `tests/telegramNotify.test.ts` | нет | уведомления гостю при подтверждении/отмене/переносе |
| `tests/telegramReminders.test.ts` | нет | напоминание за час: окно на границе суток, без повторов, 401 |
| `tests/cronCleanup.test.ts` | нет | `/api/cron/cleanup`: проверка `CRON_SECRET`, вызов очистки |
| `tests/rateLimitUnit.test.ts` | нет | ограничение частоты без базы: ключ без IP в открытом виде, 429, fail-open |
| `tests/reservations.test.ts` | да | API залов/столов/броней: создание, подтверждение, отмена, двойная бронь, согласие на обработку ПД |
| `tests/hallObjects.test.ts` | да | API схемы зала в реальном масштабе |
| `tests/audit.test.ts` | да | журнал действий: запись при смене статуса, неизменяемость, `GET /api/audit` без токена — 401 |
| `tests/privacyErase.test.ts` | да | удаление данных гостя: закрытая бронь обезличивается, активная будущая — нет, повтор безопасен, ответ одинаков, 429 |
| `tests/concurrentBooking.test.ts` | да | `CONCURRENCY` (по умолчанию 1000) одновременных броней одного стола на одно время: ровно один `201`, остальные `409`, в базе одна активная бронь. Запускается только через `npm run test:concurrency` (или `RUN_CONCURRENCY=1`) |
| `tests/telegramBooking.test.ts` | да | бронь из бота: `pending`, `source = telegram_ai`, отмена только из своего чата |
| `tests/rateLimit.test.ts` | да | счётчик `rate_limit_hit`: лимит → 429, недоступен для anon-ключа |

Тесты, которым нужен Supabase, запускаются **только против отдельного
тестового проекта**, никогда против рабочей базы ресторана: они создают и
удаляют залы, столы, брони и пользователей.

Ограничение частоты запросов в тестах выключено (`RATE_LIMIT_DISABLED=1`
в `vitest.setup.ts`); `tests/rateLimit.test.ts` включает его явно.

### Локальный запуск

```bash
npm run test:unit    # только тесты без базы
npm test             # все тесты; нужен .env.local тестового проекта
npm run lint
npm run typecheck    # next typegen + tsc --noEmit
npm run test:concurrency   # нагрузочный тест, только на тестовом проекте
```

Нагрузочный тест откажется запускаться, если `NEXT_PUBLIC_SUPABASE_URL`
совпадает с `PRODUCTION_SUPABASE_URL` (задайте её в `.env.local`, чтобы
защита работала). Число запросов — переменная `CONCURRENCY`.

Для `npm test` в `.env.local` должны быть ключи **тестового** проекта и
учётная запись сотрудника в нём (`TEST_HOSTESS_EMAIL`,
`TEST_HOSTESS_PASSWORD`), а миграции применены к нему:

```bash
npx supabase db push --db-url "$TEST_SUPABASE_DB_URL"
```

### GitHub Actions

`.github/workflows/ci.yml` запускается на каждый pull request и push в
`main`:

- `lint` — ESLint и проверка типов (`npm run typecheck`);
- `unit` — тесты без базы (`npm run test:unit`);
- `build` — `npm run build`;
- `security` — `npm audit --omit=dev --audit-level=high` и поиск секретов
  в истории (gitleaks);
- `integration` — применяет миграции к тестовому проекту и запускает все
  тесты. Не блокирует слияние, не запускается для PR из форков и
  пропускается, если секреты тестового проекта не заданы.

`.github/workflows/concurrency.yml` — нагрузочный тест, только вручную:
Actions → Concurrency test → Run workflow, поле `concurrency` (по
умолчанию 1000). Использует те же секреты тестового проекта.

### Секреты

Settings → Secrets and variables → Actions → **Secrets**:

| Секрет | Откуда |
| --- | --- |
| `TEST_SUPABASE_URL` | тестовый проект: Project Settings → API |
| `TEST_SUPABASE_ANON_KEY` | тестовый проект: Project Settings → API |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | тестовый проект: Project Settings → API |
| `TEST_SUPABASE_DB_URL` | тестовый проект: Database → Connection string → Session pooler (5432) |
| `TEST_HOSTESS_EMAIL`, `TEST_HOSTESS_PASSWORD` | сотрудник, заведённый в тестовом проекте (см. «Учётная запись сотрудника») |
| `GITLEAKS_LICENSE` | только если репозиторий принадлежит организации (бесплатно на gitleaks.io) |

Во вкладке **Variables** можно задать `PRODUCTION_SUPABASE_URL` — адрес
рабочего проекта. Если тестовые секреты по ошибке указывают на него,
интеграционные тесты откажутся запускаться.

### Обязательные проверки для `main`

Settings → Branches → Add branch protection rule → Branch name pattern
`main` → **Require status checks to pass before merging** → отметьте
`lint`, `unit`, `build`, `security` (они появятся в списке после первого
прогона CI). `integration` не добавляйте: он информационный.

## Структура проекта

```
app/
  page.tsx                 страница бронирования для гостя
  account/                 вход/регистрация/сброс пароля для гостей
  hostess/                 страницы панели персонала (вход, залы, брони, сотрудники)
  api/                      Route Handlers (залы, столики, брони, доступность)
  auth/callback/            обработчик редиректа magic-link
components/
  guest/                    сценарий бронирования (схема зала, календарь, слайдер, подтверждение)
  hostess/                  админ-интерфейс (редактор схемы зала, формы, редактор броней)
  Combobox.tsx, Modal.tsx, ConfirmDialog.tsx   общие UI-примитивы
lib/
  supabase/                 клиенты Supabase (браузер/admin/auth)
  scheduling.ts, reservations.ts, ru.ts        доменная логика и русская локализация
hooks/
  useReservationsRealtime.ts   подписка на Postgres Changes для живых обновлений
supabase/migrations/         схема, RLS-политики, RPC-функции по порядку
tests/                        интеграционные тесты Vitest
```

## Telegram-бот бронирования с ИИ

Гость может забронировать стол, написав или отправив голосовое боту в
Telegram. ИИ (Groq) только распознаёт речь и извлекает из текста дату,
время, число гостей и имя. Проверка, поиск стола и создание брони — код;
бронь создаётся в статусе «Ожидает» с пометкой «Telegram» с иконкой Telegram в панели и
расшифровкой для проверки. Подтверждение, отмена, перенос и напоминание
за час приходят гостю в Telegram.

Подключение, переменные окружения, ручная проверка, какие данные куда
уходят и аварийное отключение (`AI_BOOKING_ENABLED=0`) —
[docs/telegram-bot.md](docs/telegram-bot.md). Замер качества —
[evals/booking/README.md](evals/booking/README.md).

| Переменная | Назначение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | токен бота от @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | секрет заголовка `X-Telegram-Bot-Api-Secret-Token` (32+ символа) |
| `GROQ_API_KEY` | ключ Groq |
| `GROQ_STT_MODEL` | по умолчанию `whisper-large-v3` |
| `GROQ_LLM_MODEL` | по умолчанию `openai/gpt-oss-20b` |
| `AI_BOOKING_ENABLED` | `1` / `0` — аварийный выключатель ИИ |
| `RESTAURANT_TIME_ZONE` | IANA-пояс ресторана |
| `RESTAURANT_NAME` | название в приветствии бота (необязательно) |
| `NEXT_PUBLIC_SITE_URL` | адрес сайта для ссылок из бота и вебхука |
| `CRON_SECRET` | защита `/api/cron/cleanup` и `/api/cron/reminders` |

## Персональные данные

Форма брони (гостевая и форма новой брони в панели персонала) не
отправляется без отметки о согласии на обработку персональных данных;
`POST /api/reservations` без `consent_pd: true` отвечает `400`
(`details.consent_pd`). Момент согласия сохраняется в
`reservations.consent_at`.

Страница `/privacy` описывает только то, что код действительно собирает и
хранит. Данные, которых в коде нет, задаются переменными окружения:

| Переменная | Что показывает | Если не задана |
| --- | --- | --- |
| `NEXT_PUBLIC_OPERATOR_NAME` | название оператора персональных данных | строка не выводится |
| `NEXT_PUBLIC_PRIVACY_CONTACT` | контакт для обращений по персональным данным | предлагается обратиться в ресторан |

Удаление данных по запросу гостя: форма «Удалить мои данные» на
`/privacy` вызывает публичный `POST /api/privacy/erase` (`{ contact }` —
email или телефон). SQL-функция `erase_guest_data` обезличивает только
закрытые (`completed`, `cancelled`, `no-show`) и уже прошедшие брони с этим
контактом: имя заменяется на «Удалено по запросу гостя», телефон, email и
привязка к аккаунту стираются (`anonymized_at` фиксирует момент). Активные
будущие брони не меняются — гость сначала отменяет их. Ответ одинаковый
независимо от того, нашлось ли что-то; в журнал действий пишется только
число обезличенных строк. Лимит — 3 запроса в час с одного IP.

Срок хранения закрытых броней берётся из
`STALE_RESERVATION_RETENTION_DAYS` (`lib/reservationCleanup.ts`).
Тексты на странице не являются юридической консультацией — проверьте их с
юристом перед запуском.

## Плановая очистка

`vercel.json` запускает `GET /api/cron/cleanup` раз в сутки (03:17 UTC).
Маршрут закрывает брони, время которых прошло
(`completeExpiredReservations`), удаляет закрытые брони старше
`STALE_RESERVATION_RETENTION_DAYS` дней (`deleteStaleReservations`),
чистит окна `rate_limits` старше суток и пишет в журнал число удалённых
броней. Защищён заголовком `Authorization: Bearer $CRON_SECRET`: задайте
`CRON_SECRET` в Vercel (Settings → Environment Variables) — Vercel Cron
подставит его сам. Без переменной маршрут отклоняет все вызовы. Ручной
запуск:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<ваш-домен>/api/cron/cleanup
```

## Ограничение частоты запросов

Публичные маршруты считают запросы с одного IP в фиксированном окне
(таблица `rate_limits`, функция `rate_limit_hit`, доступ только у
сервисного ключа). IP хранится только в виде HMAC-хэша и удаляется вместе
со старыми окнами (не позже чем через сутки).

| Маршрут | По умолчанию | Переменная |
| --- | --- | --- |
| `POST /api/reservations` | 10 за 60 с | `RATE_LIMIT_RESERVATIONS` |
| `GET /api/availability` | 60 за 60 с | `RATE_LIMIT_AVAILABILITY` |
| `POST /api/privacy/erase` | 3 за 3600 с | `RATE_LIMIT_PRIVACY_ERASE` |

Формат переменной — `<запросов>/<секунд>`, например `20/60`. При
превышении API отвечает `429` с заголовком `Retry-After`. Если база
недоступна, запрос пропускается (fail-open), ошибка пишется в лог.
Лимиты входа и magic-link настраиваются в самом проекте Supabase
(Authentication → Rate Limits), а не в коде.

## Деплой

Разверните Next.js-приложение на [Vercel](https://vercel.com) с теми же
переменными окружения, что и в `.env.local` (кроме `SUPABASE_DB_URL` —
она нужна только локально для миграций). В дашборде Supabase укажите в
**Authentication → URL Configuration** ваш продакшн-домен, чтобы
редиректы magic-link и сброса пароля вели на нужный сайт, а не на
`localhost`.
