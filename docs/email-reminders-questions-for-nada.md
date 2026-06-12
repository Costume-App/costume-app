# Email reminders — questions for Nada

**Feature idea (roadmap #3c):** the app emails the team when costumes are still
outstanding as the deadline (the "costumes due" date the director sets) gets close —
e.g. a heads-up at 4 weeks out, then closer in.

The app already shows an in-app countdown + "X of Y pieces still to make." This adds
the *push* part: emails so people don't have to remember to check.

Below are the decisions we need before building it. Suggested defaults are in
**[brackets]** — Nada can just confirm or change each one.

---

### 1. Who should get the reminder emails?
- The director? The costume designer (Nada)? Everyone on the team who uses the app?
  **[Default: everyone on the team who has an app login.]**
- Should each maker/sewer get their own reminder about *just their* pieces, or is it
  enough to remind the director/designer with an overview?
  **[Default: remind the director/designer with an overview that lists who's behind;
  don't email makers individually for now.]**
  - Note: today only people with an app login have an email on file — most makers
    don't. Emailing makers directly would mean entering an email for each maker.

### 2. When should the reminders go out?
- How far ahead of the "costumes due" date?
  **[Default: 4 weeks, 2 weeks, 1 week, and 1 day before.]**
- One reminder at each of those points, or daily nudges once it's within the last week?
  **[Default: one at each point above — no daily spam.]**

### 3. What should the email say?
- The basics — show name, due date, days left, and "**X of Y costumes still to make**."
- Do you want a **breakdown by maker** (e.g. "Nada: 4 left, Crystal: 3 left") so you
  can see who's behind? A breakdown by role/character? **[Default: yes, by maker.]**
- A link back into the app (to the Costume Creations / make list)? **[Default: yes.]**

### 4. What counts as "still outstanding"?
- Pieces marked **Make** that aren't checked done. Should pieces marked **Purchase**
  that haven't been bought yet *also* count as outstanding? **[Default: yes — both.]**

### 5. Which shows get reminders?
- All **active** shows that have a "costumes due" date set — automatically?
  **[Default: yes, automatic for any active show with a due date.]**
- Or should reminders be something you switch **on per show**?

### 6. When should reminders stop?
- Stop once everything's marked done? **[Default: yes.]**
- Keep going if things are still outstanding **after** the due date, or stop at the
  due date? **[Default: stop at the due date.]**

### 7. Email vs text message?
- We're planning **email** to start (simplest — no phone numbers needed). You'd
  mentioned texts (SMS) too. Is email enough for v1, or do you really need texts?
  **[Default: email only to start; add SMS later if needed.]**

---

*Once Nada answers these, we'll write the spec and build it (Resend for email + a daily
scheduled job + a small "already-sent" table so it never double-sends). Nothing is
built yet.*
