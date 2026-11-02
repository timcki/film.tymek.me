# Future ideas

Ideas the group has discussed and deliberately not built yet, grouped by the part of the
app or the mechanic they belong to. Each entry says what it is and why it waits. When
one graduates, move it into `filmnight-spec.md` and delete it here.

## Voting and points

### Underdog point

Attendees earn 1 bonus point spendable only on a film currently outside the top 3.
Expires if unspent that week (consistent with no banking anywhere). Rewards presence
with influence that cannot entrench leaders; directly funds rotation.

Waits because v1 keeps the economy at exactly 2 points for everyone. Add once the flat
economy has settled for a few weeks.

## Special and extra nights

### An extra night beside a special night

Today only one round runs at a time, so the one-click extra night (an approval vote that
closes within two hours) cannot start while a special night is on. Running it alongside
would take a second, parallel round engine with its own picks, ticks and room, and a way
to record its winner as an evening of its own, which is a large change to the code the
main vote depends on. Waits until the two clashing is a thing that happens.

## The shortlist and the room

### Pass-over strikes (3)

A film shortlisted and passed over three times retires: archived, no points lost,
re-nominatable a season later. The room has seen it three times and declined; the slot
goes back to films the attendees might actually watch.

Waits because decay may already handle it. Add only if a persistently fed film the room
keeps rejecting squats in the top 3. The "Always the bridesmaid" figure on the Filmy
screen is how to tell: if the same few films fill it round after round, this is needed.

## Holds (Uśpij)

### A cap on holding

A limit on how often one person may hold a film back (§3.5) - say three per eight rounds,
read off the rule set so the rules screen states it.

Waits because the fade is already the cost: a held leader returns at half strength, and
every hold is public with a name on it. Add only if somebody turns out to be holding a
permanent unwatched number one. Not a "twice in a row" rule, which would punish exactly
the honest case of being away two weeks running.

## Profile, XP and badges

### Badges

Cosmetic, derived entirely from existing tables, therefore retroactive for free.
Candidates:

- **Ironman**: attendance streaks of 3 / 5 / 10 weeks
- **Kingmaker**: your flash vote broke a runoff tie
- **Nostradamus**: you had points on the winner in its winning week
- **Kurator**: 3 of your nominations watched
- **Odkrywca**: voted on a film while it had 0 points and it later won
- **Duch**: attended without having voted that week

Avoid any badge that rewards voting the same film repeatedly; that is anti-rotation.

### Attendance streak XP bonus

Extra XP per consecutive attended week. Waits so v1 XP stays flat and easy to explain;
streaks arrive together with badges.

### Level perks

Non-cosmetic rewards at level thresholds (second nomination slot, one free
re-nomination). Risky: turns prestige into power and compounds for regulars. If ever
added, only nomination-side perks, never point-side.

## Statistics

Each is a query over tables that already exist, so each is retroactive for free
(invariant 7). They wait only because the screen is not short of things to read yet. A
person-by-person figure should be drawn the way the existing ones are: a row per person
that fills in the profile card when pressed. There are no ratings anywhere in the data,
so nothing here can say how much somebody liked a film, only what they did about it.

### Ludzie

- **Taste twins and opposites**: the pair who back the most of the same films, and the
  pair furthest apart. From points on the list, and from rankings in the room.
- **With the room or against it**: how often a person's first choice in the room is the
  film that wins. Rankings are public once a room has closed.
- **What each person brings**: the average release year, runtime, main genre and main
  country of their nominations.
- **Nomination win rate**: nominations that got watched, out of all a person nominated.
  "Whose films we watch" only counts the wins.
- **All on one film or spread out**: how a person splits their points, and what share of
  them they spend at all, since unspent points vanish.
- **Attendance streaks**: the longest run of nights in a row, and who has never missed.
  Shares its data with the Ironman badge.
- **Who puts films to sleep**: how often each person uses Uśpij.

### Filmy

- **Crowd favourite or one champion**: the films with the most different backers, set
  against films carried by one person's points.
- **Most divisive**: the room film whose rankings are furthest apart, first on some
  ballots and last on others. Stands in for "most divisive pick", which a ratings-based
  club would read off its ratings.
- **Which genre, decade or country wins**: each one's share of nominations against its
  share of nights actually watched.
- **Hours together**: the total runtime of everything watched, and per year.

### Wieczory

- **Rhythm**: days between nights, the longest break, nights per month.
- **Turnout trend**: how many people are in the room each night, and the best-attended.
- **Closest finishes**: the smallest gaps between first and second, and how many times
  the §3.2 tie-break order is what actually decided a shortlist seat or a room.
- **Room against list**: how often the room's winner was not the list's leader. The
  voting-theory name for the opposite is Condorcet efficiency.
- **When votes land**: the whole group's votes by weekday and hour, as a heat map.
- **Special nights and trips**: how many special nights, extra nights, cinema trips and
  outings there have been, and who joins them.

## The watched screen (Obejrzane)

The poster cards show the title, the evening and, for an outing, where. The points are
no longer on them. Things that could go on a card later, none of them wanted yet:

- who nominated it, as a small face
- the release year, or the runtime
- how many rounds it waited on the list
- how many people backed it
- how many had already seen it (the eye)
- a marker for a special night's pick

Waits because the card is small and a phone shows two to a row; each addition costs the
title room. Add one only if somebody asks for it.

## Rejected or superseded

- **Lower bank cap (4)**: superseded by removing banking entirely.
- **Shortlist cooldown** (passed-over film sits out a week): redundant with strikes.
- **Attendance dividend** (+1 income next week): compounds voting power for regulars;
  the underdog point is the safer shape of the same reward.
- **Who comments the most**: removed from the statistics. The comments are in the app, and
  a count only encourages writing more of them.
