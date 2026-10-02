# Where's Blake?

A joke "live tracker." Blake, a cutout of his own head, runs between real places in Logan, Utah on a hand-drawn map. None of it is real: every visitor's browser makes up its own schedule for him, so two people comparing screens see him in different places. Blake is a real person, so keep the jokes friendly.

The whole site is one self-contained HTML file in this repo, with the HTML, CSS and JavaScript together. There's no build step and no framework. The page is served straight from the repo, so whatever gets merged is what visitors see. Don't rename the file, because its name is part of the public URL. The only outside request is Google Fonts (Overpass), and the page has to keep working if that fails to load.

## Places

Places live in the `LOCATIONS` array at the top of the script, and most requests will be about them.

- `name` is the label on the map.
- `phrase` is how the place reads mid-sentence, as in "Left the office" or "Blake is sprinting to Royal Express."
- `here` is a list of endings for "Blake is …" while he's at that place. Every ending has to make sense for that particular place. You can be in an office, but you can't be inside a desk.
- `activities` fill the "Currently" line.
- `icon` is the emoji in his thought bubble while he's there.
- `address` only appears in the pin's hover tooltip.
- `labelSide` is "left", "right" or "below". Pick whichever keeps the name clear of other labels and roads.

`north` and `east` are Logan grid numbers. 100 is one block, and south and west are negative. So 820 N 1200 E is `north: 820, east: 1200`, and 880 S Main St is `north: -880, east: 0`. The map's frame is worked out from the places, so a place outside the current area makes the map bigger.

The owner writes some of the jokes themselves. Leave their wording alone unless asked, even where it looks like a typo.

## How the rest works

The map is an SVG that the script draws in city-block coordinates. `S` is the number of SVG units per block, and `px()` and `py()` convert block coordinates to SVG coordinates. It's a cartoon, and the geography is approximate on purpose. It shows:

- the street grid
- Main St in yellow, which forks just above Royal Express: US-89/91 curves off to the southwest while S Main St carries on south as a normal street
- 400 N in yellow
- a blob for the USU campus
- foothills along the east edge, which start at `HILLS_X`

Blake himself is a small WebP of his head, embedded as a data URI in `<image id="blake-head">` inside the map's `<defs>`, so the page stays one file. To change the photo, replace that data URI and keep the image small (it's about 4 KB now). While he runs he leans toward where he's going, bobs, and leaves a 💨 behind him. The head is never mirrored, so his face always reads the right way round.

Blake's schedule is deterministic for each visitor:

1. A random seed is kept in localStorage under `wheres-blake-seed`.
2. Time is cut into 26-second slots, and where he is at each slot boundary is hashed from the seed and the slot number.
3. Inside a slot he does one of four things: stays put, runs to the next place (sometimes by "the scenic route"), turns back because he "forgot something," or runs laps around the block.

Refreshing shows the same Blake. To get a new one, clear that localStorage key. Routes follow the street grid and never move diagonally. The status line, the stats and the "Recent sightings" log are all computed from the same timeline.

Some things look like bugs but are jokes:

- his speed is reported in the hundreds or thousands of mph
- accuracy can be "± 3 mi"
- the log shows real clock times for a schedule that's made up

## Conventions

- Colors are CSS custom properties on `:root`. Dark mode redefines them in two places, the `prefers-color-scheme` media query and `:root[data-theme="dark"]`, and the two blocks must stay identical.
- Respect `prefers-reduced-motion`, which means no bobbing, head wobble, dust puffs or pulsing dot.
- Keep every localStorage access inside try/catch.
- Street names use non-breaking spaces so they never wrap in the middle.

## Checking changes

After any change, run:

    node tools/check.js path/to/page.html

It only needs Node 18 or later. It simulates several visitors for a few hours each and fails if any of these happen:

- Blake teleports
- Blake cuts across a block
- Blake leaves the map
- the script crashes
- the status line goes blank

Then it prints every status line, activity and log entry the page can produce. Read through them, because each one has to sound like natural English.

If a headless browser such as Playwright is available, also screenshot the page at desktop and mobile widths in both light and dark mode. Check that the place labels don't collide with each other or with roads.
