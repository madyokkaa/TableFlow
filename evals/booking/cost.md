# Расчёт стоимости ИИ-брони (шаблон)

Цифры тарифов сюда **не вписаны**: команда вносит их сама со ссылкой на
официальный прайс и датой, на которую он взят.

## 1. Тарифы

| Что | Модель | Цена | Единица | Источник (ссылка на прайс) | Дата |
| --- | --- | --- | --- | --- | --- |
| Распознавание речи | `whisper-large-v3` | | за час аудио | | |
| Извлечение полей, вход | `openai/gpt-oss-20b` | | за 1 млн токенов | | |
| Извлечение полей, выход | `openai/gpt-oss-20b` | | за 1 млн токенов | | |

## 2. Фактическое потребление на одну бронь

Источники:

- **Рабочий трафик** — таблица `ai_requests` (одна строка на вызов, без
  содержимого сообщений):

  ```sql
  -- средние на одну созданную через бота бронь за последние 30 дней
  select
    count(distinct reservation_id)                                  as bookings,
    sum(audio_seconds) / nullif(count(distinct reservation_id), 0)  as audio_sec_per_booking,
    sum(tokens_in)     / nullif(count(distinct reservation_id), 0)  as tokens_in_per_booking,
    sum(tokens_out)    / nullif(count(distinct reservation_id), 0)  as tokens_out_per_booking,
    count(*) filter (where kind = 'extract')::numeric
      / nullif(count(distinct reservation_id), 0)                   as extract_calls_per_booking
  from ai_requests
  where at > now() - interval '30 days' and reservation_id is not null;

  -- доля вызовов, которые не привели к брони (уточнения, отказы)
  select kind, count(*) filter (where reservation_id is null)::numeric / count(*) as share_without_booking
  from ai_requests where at > now() - interval '30 days' group by kind;
  ```

- **Eval** — сводка `evals/booking/results/…_summary.md` (токены и
  секунды аудио за прогон).

| Показатель | Значение | Откуда |
| --- | --- | --- |
| Секунд аудио на бронь | | |
| Токенов на входе на бронь | | |
| Токенов на выходе на бронь | | |
| Вызовов без брони на одну бронь | | |

## 3. Формула

```
стоимость в месяц =
  броней в месяц × (1 + вызовов без брони на бронь)
  × ( секунд аудио на бронь / 3600 × цена часа аудио
    + токенов на входе на бронь / 1e6 × цена 1 млн входных
    + токенов на выходе на бронь / 1e6 × цена 1 млн выходных )
```

| Сценарий | Броней в месяц | Стоимость в месяц |
| --- | --- | --- |
| Текущий | | |
| ×10 | | |

## 4. Бесплатный тариф

Лимиты бесплатного тарифа Groq — на официальной странице лимитов (ссылка
и дата сверки): ________. Когда лимит исчерпан, бот переходит на базовое
решение без ИИ, а если не справляется и оно — предлагает
забронировать на сайте (см. `docs/telegram-bot.md`).
