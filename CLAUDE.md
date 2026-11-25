# SCA Eagles Master Schedule — Permanent Project Instructions

## 1. Background and purpose

I am Matt Bottoms, the Middle School and High School Athletic Director at Scottsdale Christian Academy (SCA) in Phoenix, Arizona.

I developed this public athletics dashboard with ChatGPT and OpenAI Codex. It is an existing, functioning application. You are continuing development, not starting over.

The dashboard provides coaches, parents, athletes and school staff with a single location to see athletic practices, games, facility usage, transportation, dismissal times and team calendars.

Accuracy and reliability are more important than adding features.

## 2. GitHub and hosting

- Personal GitHub account: matthewbottoms-lab
- GitHub organization: SCA-Eagles
- Repository: SCA-Eagles/sca-eagles.github.io
- Repository URL: https://github.com/SCA-Eagles/sca-eagles.github.io
- Production website: https://sca-eagles.github.io/
- Production branch: main
- Hosting: GitHub Pages
- Deployment: GitHub Actions
- External scheduled refresh infrastructure: Cloudflare
- School time zone: America/Phoenix (Arizona does not observe daylight saving time)

The repository was migrated from an earlier personal repository to the SCA-Eagles organization. It was imported without the original commit history.

Do not create a replacement repository, change the website address or move hosting to another service.

This application does not require Netlify or Supabase. Those services belong to a separate flag football statistics project.

## 3. Primary objectives

The dashboard must:

- Automatically reflect changes made to my existing Excel master schedules.
- Require no duplicate manual data entry.
- Be publicly accessible without a login.
- Work extremely well on iPhones.
- Be easy for parents, coaches and athletes to understand.
- Provide individual team calendar subscriptions.
- Display accurate game locations and directions from verified sources.
- Remain read-only.
- Require minimal ongoing maintenance.

My existing Excel workbooks are the operational source of truth.

Never modify the original Excel workbooks.

## 4. Data sources

There are two primary Excel workbooks hosted through Microsoft SharePoint.

### Field & Gym Schedule

Contains facility usage, practices, games and notes.

Seasonal worksheet names:

- Fall
- Winter
- Spring
- Summer

### Transportation Schedule

Contains game information and transportation arrangements.

The current worksheet is named:

`2026-2027 Transportation`

Its columns are:

1. Date
2. Team
3. Dismissal
4. Time
5. Opponent
6. Home/Away
7. Venue
8. Transportation

Only use the current school year’s transportation worksheet. Do not include historical years.

The workbook URLs are stored as GitHub Actions repository secrets:

- SCA_FACILITIES_URL
- SCA_TRANSPORTATION_URL

Never expose the actual workbook URLs in public source code, browser requests, logs, issues or commits.

## 5. Official external schedules

High school athletics:

https://azpreps365.com/schools/scottsdalechristian

Middle school and applicable elementary athletics:

https://www.quickscores.com/ccsl

CCSL schedule directory:

https://www.quickscores.com/Orgs/Schedules.php?OrgDir=ccsl

CCSL location directory:

https://www.quickscores.com/Orgs/LocationsList.php?OrgDir=ccsl

Official AIA school directory:

https://aiaonline.org/

The Excel master schedule determines which events appear on the dashboard. Official external schedules supplement and verify game details.

Do not automatically replace my Excel schedule with an external schedule.

If sources disagree, investigate the discrepancy rather than silently overwriting information.

Use the actual current team schedule pages, not cached Google search summaries.

## 6. Automatic refresh and publishing

The application is a static website that consumes generated JSON files.

GitHub Actions downloads the Excel workbooks, converts them into JSON, generates calendar subscriptions, retrieves official game locations and deploys the finished website.

The intended refresh cadence has historically been approximately every 30 minutes.

We configured an external Cloudflare trigger because we wanted more reliable scheduled updates.

The current GitHub refresh workflow also supports manual workflow dispatch and contains a daily scheduled run at 3:17 AM Arizona time.

The exact active Cloudflare Worker configuration must be verified before modifying it.

Important distinctions:

- Reloading the dashboard retrieves the latest published information.
- Reloading the dashboard does not necessarily trigger a new Excel download.
- The public refresh button currently reloads the webpage with a cache-busting parameter.
- The actual backend refresh is handled by GitHub Actions and the external trigger.

Preserve the existing automatic refresh infrastructure.

Do not expose a GitHub access token in client-side JavaScript.

Display the last successful refresh time accurately.

Never pretend data has refreshed successfully when the original workbooks could not be downloaded.

The current dashboard warns when schedule data is more than 90 minutes old.

If a refresh fails, preserve the last successful published website rather than replacing it with incomplete or empty data.

## 7. Repository structure

Important files and directories:

### Website

- dashboard/index.html — main page structure
- dashboard/app.js — dashboard loading, navigation, rendering and timeline
- dashboard/logic.js — schedule processing, date/time parsing, workbook columns and deduplication
- dashboard/lanes.js — field, baseball field, gym and away classification
- dashboard/month-team.js — monthly calendar, seasonal teams, team filters and note-derived practices
- dashboard/display.js — display text, labels and badges
- dashboard/game-details.js — clickable official game details and directions
- dashboard/game-match.js — official game matching
- dashboard/calendar-subscribe.js — calendar subscription interface
- dashboard/sca-dashboard-actions.js — homepage action buttons
- dashboard/styles.css — primary styling
- dashboard/sca-homepage.css — school-branded homepage styling
- dashboard/month-team.css — month and team styling
- dashboard/ux.css — user-interface refinements
- dashboard/sca-logo.png — actual SCA logo

### Data generation

- scripts/refresh.mjs — downloads and converts Excel workbooks
- scripts/calendars.mjs — generates public ICS calendar subscriptions
- scripts/game-locations.mjs — retrieves official game location information

### Data

- data/facilities.json
- data/transportation.json
- data/status.json

These are automatically generated and updated by the refresh workflow. Do not manually hardcode schedule changes into them.

### Automation

- .github/workflows/refresh.yml
- .github/workflows/dashboard-tests.yml

### Testing

- tests/field-lanes.test.mjs
- tests/game-locations.test.mjs

The application uses JavaScript, HTML, CSS and Node.js. GitHub Actions currently uses Node.js 22.

Existing dependencies include XLSX, Cheerio, fetch-cookie and tough-cookie.

Preserve the lightweight architecture. Do not introduce React, a database or another framework unnecessarily.

## 8. Excel parsing rules

The Excel formatting and column positions can change as I update my master schedule.

Never depend exclusively on hardcoded column numbers.

Detect facility columns using:

- Team column headers
- Field Notes headers
- Gym Notes headers
- Field Schedule section headers
- Baseball Field Schedule section headers

A previous issue occurred when Excel columns were deleted, causing practices to appear under the wrong teams. Dynamic header detection was introduced to fix this.

Preserve that behavior.

Normalize whitespace and common abbreviations without losing meaningful team identities.

Keep distinct teams and contests separate.

Do not silently drop a legitimate activity because the format is unusual.

## 9. Event classification rules

### Home games

Entries using:

- vs
- vs.
- versus

Normally indicate home games, unless explicit venue or transportation information establishes otherwise.

### Away games

Entries using:

- @
- at

Normally indicate away games.

Handle missing spaces correctly.

For example:

`5:00pm@Heritage`

Must be recognized as an away game.

An away game must never reserve an on-campus field or gym.

Transportation’s H/A field should be respected, while also accounting for a specifically listed off-campus venue.

### Practices

A cell containing only a time or time range normally represents a practice.

Examples:

- 3pm
- 3–5pm
- 3:15–4:45pm
- 7am–8:45am

Do not arbitrarily assign an opponent, game status or facility to a practice.

### Other activities and placeholders

Preserve entries such as:

- TBD
- Playoffs
- Tournament
- If Necessary
- Scrimmage

Do not invent opponents, times or locations.

Calendar subscriptions should preserve unresolved placeholders as tentative or all-day entries when an actual game or practice time has not been established.

### Empty values

Ignore cells containing:

- X
- N/A
- None
- A standalone dash
- Blank values

In transportation and dismissal fields, X has a specific meaning described below.

## 10. Time parsing

Time accuracy is extremely important.

Support:

- Standard hyphens
- En dashes
- Em dashes
- The word “to”
- AM and PM
- Times with and without minutes
- Multiple time ranges in one cell
- Times in facility notes

Examples:

- 3–5pm = 3:00 PM to 5:00 PM
- 3:15–4:45 = 3:15 PM to 4:45 PM in the normal after-school scheduling context
- 7–8:45am = 7:00 AM to 8:45 AM
- 11am–1pm = 11:00 AM to 1:00 PM
- 4–5pm and 6–7pm = two distinct ranges

We previously encountered problems where:

- Baseball 3–5pm displayed only 3pm.
- 3:15–4:45 displayed only 4:45.
- A morning flag football practice was incorrectly represented as an evening practice.

Do not regress these fixes.

Never invent an event duration from a single start time.

A game listed at 4pm has a known start time, not a known ending time.

On the timeline, represent games with only a start time as markers rather than fabricated duration blocks.

## 11. Facility notes

Field Notes and Gym Notes are meaningful schedule data.

I sometimes schedule teams in these notes rather than their normal team columns, particularly when the next sports season is approaching.

Example:

MS Baseball
3–5pm

This should be visible when someone filters the dashboard to that team, and included in its calendar subscription when the team and time are unambiguous.

Preserve:

- Multiline notes
- Multiple teams listed in one note cell
- Multiple practice times
- Facility restrictions
- Overseeding information
- Maintenance
- Weather-related closures

Do not turn general maintenance or ambiguous notes into team practices.

In All Teams mode, show the original combined facility notes without duplicating the extracted team events.

In individual team mode, display the relevant extracted practice and applicable facility restrictions.

The original Excel wording should be retained where practical.

Spreadsheet instructions such as “See Winter Sports Tab” should not clutter the public dashboard.

## 12. Facility classification

The dashboard has four primary lanes:

### Field & Outdoor

Main football/turf field and applicable outdoor sports.

Includes:

- Football
- Flag football
- Soccer
- Softball
- Other relevant outdoor practices

### Baseball Field

A separate facility from the main football field.

Baseball activities should be classified in the Baseball Field lane when using that facility.

The existing code deliberately classifies baseball separately even when a baseball column appears under a main-field header.

### Gym & Indoor

Includes:

- Basketball
- Indoor volleyball
- Other applicable indoor sports

### Away Games & Transportation

Off-campus contests and related transportation information.

Never display away events as on-campus facility reservations.

Hide the Baseball Field lane on dates when it has no applicable activities.

Maintain consistent facility classification across Today, Month, Timeline and calendar data.

## 13. Internal facility scheduling rules

These are my athletic department operational rules.

They are useful for understanding the schedule, validating data and building any future administrative features.

Do not reintroduce public conflict warnings or an administrative conflict dashboard unless I specifically request it.

### Football/turf field

- Normally a maximum of two teams using the field simultaneously.
- Teams can share the field when appropriate.
- Do not assume that every overlap is a conflict.

### Baseball field

- Separate from the football/turf field during winter and spring.
- Baseball field usage does not automatically conflict with football field usage.
- The baseball outfield is sometimes used during the fall.
- Preserve “(Outfield)” when that is specified.
- Do not erase distinctions between cages, outfield and other baseball activities.

### Softball

- Softball uses the main football field.
- It generally occupies half the field.
- It can coexist with another appropriate practice.
- Do not automatically place softball in the Baseball Field lane.

### Gym

- Two simultaneous practices are generally allowed.
- Two simultaneous games are not allowed.
- A game and practice overlap requires review of the actual arrangements.
- Certain winter basketball practice overlaps are intentional.

### Overseeding

- Overseeding can close the baseball field.
- The football field is turf and is not automatically closed by baseball field overseeding.
- Do not apply a closure to an unrelated facility.
- Use the actual dates and facility restrictions in the source.

### FMX

FMX is a separate school facility scheduling system.

For athletic department purposes, I only care about field and gym usage.

FMX is not currently established as a primary public dashboard data feed. Do not add it automatically without my direction.

## 14. Transportation and dismissal rules

Transportation worksheet values are important.

### X

An X in the dismissal field means no dismissal is needed.

An X in the transportation field means no vehicle is needed.

It is an accounted-for value, not missing information.

Do not display X as an actual dismissal time or vehicle.

### Blank values

Blank means the information has not been supplied.

Do not automatically assume that a blank means no vehicle or dismissal is needed.

### Home games

Generally do not need transportation or early dismissal.

### Away games

May require transportation and early dismissal.

Dismissal is relevant when students must leave school early for travel.

Never invent a dismissal time or vehicle assignment.

Preserve the actual information listed in Excel.

### Non-athletic transportation

The transportation workbook includes events unrelated to athletics.

Exclude:

- Field trips
- Teacher-only entries
- Grade-only transportation
- General school activities
- Other non-athletic transportation

Do not accidentally exclude legitimate athletics, including:

- Middle school golf
- Swimming
- Cross country
- Spiritline
- Cheer
- Elementary athletic teams

## 15. Duplicate games

A home game may appear in both the Field & Gym Schedule and the Transportation Schedule.

It should generally appear only once on the dashboard.

Deduplicate only when there is sufficient evidence that the two records describe the same contest.

Consider:

- Date
- Sport
- School level
- Gender
- Team level
- Team color
- Opponent
- Game time

The existing logic uses conservative, mutually unique matching and a limited time tolerance.

When a game is confidently matched:

- Keep the transportation record.
- Preserve dismissal and vehicle information.
- Preserve useful facility details from the facility record.

Never merge two legitimate JV and Varsity games merely because they occur on the same day.

Never merge different opponents, different team colors or incompatible school levels.

If a match is ambiguous, preserve the separate records rather than deleting a real game.

## 16. Team naming and grouping

Team categories should primarily follow the team columns in my Field & Gym Schedule.

Transportation rows may contain more granular team names than the master facility columns.

Examples:

- JV
- JV1
- JV2
- Varsity
- Frosh
- Fr/So
- Red
- Blue
- White
- Gold

Normalize equivalent labels carefully, but do not combine different actual teams.

Do not create unnecessary additional team filters when the master schedule already groups a program.

### High school girls flag football

JV and Varsity are generally combined for practices.

Preserve the combined practice category.

Their games can be separate contests and must retain their distinct opponents and start times.

### Middle school

Middle school Varsity and JV are not high school teams.

The presence of the word Varsity does not automatically mean high school.

### Elementary athletics

5th grade, 6th grade and 5/6 teams should remain distinguishable.

They may be included under the public middle school/younger athletics filter.

### Seasonal filters

The team list should adapt to the active sports season.

Include neighboring-season teams when they have explicitly scheduled practices in facility notes.

Also include legitimate transportation-only teams such as middle school golf.

Avoid filling the filter dropdown with teams that do not apply to the selected period.

## 17. Game location and address feature

This is one of the most important features Codex recently added.

When someone clicks a game, open a details dialog showing:

- Team
- Date
- Opponent
- Official game location
- Verified street address
- Get Directions button, when an address exists
- Link to the official schedule
- Link to the address source when available

The location must come from an official schedule.

High school: AZPreps365 or applicable AIA bracket.

Middle school: CCSL QuickScores.

The AIA member-school directory can supply a missing street address when the officially listed venue uniquely matches a school.

Existing verified QuickScores location addresses take priority.

### Never guess locations

Do not assume:

- The opponent’s campus is the game location.
- A home game must be at SCA.
- Every tournament game is at the host school’s campus.
- A school’s main address is the correct address for a separately named facility.
- A neutral-site game is at either opponent’s school.

A game against a particular opponent may be played somewhere entirely different.

Only use a verified address for the actual listed venue.

If the official game cannot be matched:

Display “Location not listed” and/or “Address not listed.”

Do not show a directions button without a verified address.

### Matching requirements

Match the official schedule using:

- Exact date
- Correct team category
- Correct opponent when specified
- Exact start time when necessary to distinguish multiple matches

Do not use fuzzy matching that could accidentally send a family to the wrong school.

Official location data older than 36 hours is currently rejected.

Conditional playoff placeholders must not be assigned predicted venues.

### Recent Codex fixes

Codex fixed:

- QuickScores division-prefixed school names.
- December 4 QuickScores venue matching.
- Official AIA school-address lookup.
- Named tournament games with explicitly listed opponents.
- Bracket games with verified venues.
- Missing-space away markers.
- Separate baseball field classification.

Preserve these fixes and their regression tests.

## 18. Public dashboard appearance

The website should be titled:

**Master Schedule**

Use the actual SCA Eagles logo already stored in the repository.

Preserve the school’s navy, gold and clean school-branded appearance.

The website should feel like a polished athletic department application rather than a generic spreadsheet.

### Homepage

The main focus is today’s athletic schedule.

Provide:

- Current date
- Day navigation
- Easy access to the current day
- Clear schedule cards
- Field, Gym, Baseball Field and Away sections
- Last successful update time
- Refresh button
- Team filtering

Keep the homepage clean.

I previously requested that unnecessary large summary counts at the top be removed or visually de-emphasized.

Do not hide legitimate schedule entries to make the homepage shorter.

A previous per-lane display limit hid an entire baseball team. All scheduled teams must remain visible.

### Views

Preserve the existing:

- Today/Overview view
- Month calendar
- Timeline/week navigation
- Team-specific filtering

The monthly calendar should allow someone to select a date and see its activities.

The timeline should make overlapping facility usage easy to understand.

### Bottom action buttons

Preserve prominent, easy-to-use actions for:

- Calendar Subscription
- Team View
- Other existing navigation actions

Use meaningful facility icons.

### Mobile

Prioritize iPhone usability, including:

- Comfortable tap targets
- Responsive cards
- Readable text
- Accessible dialogs
- No unnecessary horizontal scrolling
- Add-to-home-screen icons and metadata

Preserve existing web manifest and SCA logo assets.

## 19. Public versus administrative functionality

This is intentionally a public, read-only dashboard.

We previously removed the separate coach view and public conflict detection.

Do not restore these without asking me.

Do not add:

- Public schedule editing
- Public approval workflows
- Administrative conflict alerts
- Login requirements
- Private athlete information
- Internal workbook links
- Credentials or access tokens

Some older files may remain from previous features. Do not assume every file represents an active production feature.

Do not remove them or reactivate them without understanding their dependencies.

## 20. Calendar subscriptions

Parents and coaches should be able to subscribe to:

- All Athletics
- Individual teams

Subscriptions must update automatically when the generated schedule changes.

Do not replace subscriptions with one-time calendar downloads.

Current public calendar infrastructure:

- /calendars/all.ics
- /calendars/index.json
- /calendars/sca-team-[stable identifier].ics

Team subscriptions use stable hashed identifiers.

Do not change these URLs unnecessarily, because existing subscribers could lose access.

Calendar support includes:

- Apple Calendar subscription
- Copying a subscription link for Google Calendar
- Compatible ICS calendar clients

Calendar events must use America/Phoenix.

Preserve stable event UIDs where possible so changed times update existing calendar entries instead of creating duplicates.

### Calendar event rules

Practices should be identified as practices.

Games should be clearly identified as home or away, with the correct opponent.

Do not label games as practices.

Do not label practices as games.

Keep unresolved events and placeholders rather than inventing details.

An explicitly scheduled practice range should contain both start and end times.

A game with only a start time should not get a fabricated end time.

Recognize multiple separate games listed in one master schedule cell.

Keep distinct team calendar categories consistent with the website filters.

Facility notes that clearly identify a team and practice time should feed its calendar.

General facility notes and maintenance should not become team calendar events.

## 21. Data integrity and failure handling

The existing refresh script contains important safeguards.

It validates:

- Whether the workbook downloaded successfully.
- Whether the downloaded file is an actual XLSX file.
- Required worksheet names.
- Whether the workbook contains a reasonable number of rows.
- Whether the workbook unexpectedly lost a substantial amount of data.

Preserve these safeguards.

Do not publish incomplete data from a failed refresh.

Do not silently ignore missing worksheets or unsupported source formats.

Do not make a failed refresh look successful.

Keep the last successful published website available.

Generated JSON and ICS files must remain consistent with the same source data.

When the school year changes, update the current-year worksheet selection carefully and test against the new workbook structure.

## 22. Development workflow

I am not a professional software developer.

I prefer to explain what I want in ordinary English and have you handle the implementation.

Work the way Codex has been working:

1. Inspect the existing repository and relevant files.
2. Understand the current behavior before making changes.
3. Identify the actual cause of the problem.
4. Make the smallest reliable change.
5. Add regression tests where appropriate.
6. Test the application.
7. Commit changes to a separate branch.
8. Create a pull request.
9. Explain what changed in plain English.
10. Provide the pull request link.
11. Allow me to approve and merge the change.

Do not commit directly to main without my authorization.

Avoid broad rewrites when a targeted fix is sufficient.

Do not make unrelated changes.

Preserve features that already work.

Be aware that GitHub Actions frequently updates generated schedule data, so main may advance while you are working. Avoid overwriting newer data commits.

Do not manually edit generated schedule JSON to fix an underlying parsing issue.

## 23. Testing requirements

Use the existing Node.js test infrastructure.

Commands:

`npm install`

`npm test`

Individual test commands:

`node --test tests/field-lanes.test.mjs`

`node --test tests/game-locations.test.mjs`

To generate official location data independently without the private Excel credentials:

`node scripts/game-locations.mjs /tmp/sca-locations`

The full refresh requires the configured workbook secrets.

The existing GitHub pull request workflow automatically runs dashboard regression tests.

Add tests for new scheduling edge cases.

Test the following when relevant:

- Home games
- Away games
- Away games with no space before @
- JV and Varsity games on the same day
- Different middle school team colors
- Combined flag football practices
- Baseball field versus football field
- Softball on the football field
- Transportation-only sports
- Morning practice ranges
- Afternoon practice ranges
- Multiple time ranges
- Team practices in facility notes
- Missing game locations
- Neutral-site games
- Named tournaments
- Conditional playoff games
- Official venue addresses
- Failed refresh handling
- Calendar subscriptions
- Mobile appearance

Do not claim a fix is working if you were unable to run the relevant tests.

## 24. Known items to verify before future changes

These are areas worth reviewing, not instructions to automatically rewrite the application.

- Confirm the external Cloudflare trigger is still refreshing the site at the intended cadence.
- The README and website footer describe approximately 30-minute updates, while the GitHub workflow itself contains a daily scheduled run plus manual dispatch.
- Check that the Today, Month and Timeline views use consistent facility classification.
- Confirm note-derived practices work with all supported time-range formats.
- Confirm morning versus afternoon time parsing remains correct.
- Confirm the public refresh button retrieves newly published data without exposing credentials.
- Confirm the original SCA branding and homepage buttons remain intact.
- Check that calendar subscriptions remain stable across code changes.

If you discover a problem outside my requested task, tell me about it before making unrelated changes.

## 25. Non-negotiable principles

- Never guess a schedule.
- Never guess a game location.
- Never guess an address.
- Never invent a dismissal time.
- Never invent a vehicle assignment.
- Never invent an event duration.
- Never modify my source Excel workbooks.
- Never expose private credentials or source workbook links.
- Never confuse baseball field usage with football field usage.
- Never remove a legitimate team or game to simplify the display.
- Never break existing calendar subscription URLs unnecessarily.
- Never rewrite the entire application without my approval.

The website needs to reflect my actual athletic schedule accurately.

## 26. Initial assignment (completed November 2026)

This was the first Claude Code assignment. It has been completed; it is kept here for history.

Save these instructions as CLAUDE.md in the repository root so future Claude Code sessions can reference them.

Read the existing README, source files, workflows and tests.

Review the recent Codex commits and pull requests to understand the development history.

Compare the existing implementation to these instructions.

Run the available regression tests.

Provide me with a concise summary of:

- How the application works.
- Whether you understand the scheduling rules.
- Any discrepancies between these instructions and the current implementation.
- Anything you need me to clarify.

Create a pull request containing the CLAUDE.md instructions.

Do not make functional changes to the dashboard as part of this initial assignment.
