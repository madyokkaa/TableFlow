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
| `tests/bookingSlots.test.ts` | нет | сетка слотов персонала, занятые слоты |
| `tests/dashboardLive.test.ts` | нет | состояние столов на дашборде «сейчас» |
| `tests/floorPlan.test.ts` | нет | геометрия схемы зала, валидация полей зала/объектов |
| `tests/passwordStrength.test.ts` | нет | оценка надёжности пароля |
| `tests/timeZone.test.ts` | нет | часовые пояса, «сегодня» для правил брони |
| `tests/rateLimitUnit.test.ts` | нет | ограничение частоты без базы: ключ без IP в открытом виде, 429, fail-open |
| `tests/reservations.test.ts` | да | API залов/столов/броней: создание, подтверждение, отмена, двойная бронь |
| `tests/hallObjects.test.ts` | да | API схемы зала в реальном масштабе |
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
```

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
