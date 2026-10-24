# Agent instructions

For AI coding assistants (Claude Code, GitHub Copilot, Codex, Cursor and others) working in this repository.
People should start with [CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

A Home Assistant dashboard card (Lit and TypeScript, bundled by Rollup, distributed through HACS) that draws a
grain silo or bin to scale, section by section, and fills it to the level a sensor measures. It reads the
[Silo](https://github.com/olivierouellet/Silo) integration's fill sensor, whose `silo` attribute describes the
silo, or one distance sensor (usually ESPHome, at the top of the silo) with the silo described in the card.

## Before you finish

```bash
corepack enable && yarn install   # once
yarn build                        # lint, translations, type check, tests, then dist/silo-card.js
```

`yarn build` must pass; CI runs the same, plus HACS validation. For a visible change, look at it with
`yarn start` (`http://localhost:5050/?dark&lang=fr&width=320`) in light and dark, and at 320 px.

## Conventions

* **English first.** Every document is bilingual, English section first; a change users see goes in both.
* `src/localize/languages/en.json` is the reference: `yarn lint` checks that `fr.json` has the same keys and
  `{placeholders}`, and the card falls back to English. Add every string to both files.
* `src/geometry.ts` and `src/silo.ts` stay free of Lit and Home Assistant, in metres, cubic metres and
  kilograms; units are converted only at the edges (`src/units.ts`). Test every change to them.
* They are mirrored in Silo's `custom_components/silo/geometry.py`, whose tests hold the same numbers: change
  one, change the other. The card's option names are also the integration's (`src/integration.ts`).
* The sensor's value is never smoothed or corrected by the card: filtering belongs in the sensor (see
  `examples/esphome/silo.yaml`).
* Nothing from Home Assistant is inserted as HTML: no `unsafeHTML` or `innerHTML`; let Lit escape the text.
* `dist/` is never committed; the release workflow builds `silo-card.js` from the tag and attaches it.
* A release bumps `package.json` and `CARD_VERSION` in `src/const.ts` in a commit titled
  `[Card] Version X.Y.Z`, then pushes a tag `vX.Y.Z`. The release workflow creates a draft release with
  `silo-card.js` attached; publish it once its notes (English, then French) are written. Don't create the
  release by hand: HACS could see it before the file is attached.

## Commits and publishing

* Commit titles read `[Topic] What changed`, one topic per commit. Topics in use: `[Card]`, `[Tests]`, `[Tooling]`, `[Docs]`.
* **Never commit, push, tag, publish a release, or open an issue or pull request unless asked.** Approval for
  one of these is not approval for the next.
* `main` is protected against force-pushes and deletion: never rewrite history that is already pushed.
* Never post comments on issues or pull requests on the user's behalf without their review.

## AI policy

This project follows its [AI policy](AI_POLICY.md): a person reviews and understands every change, no
autonomous contributions, and nothing is posted on someone's behalf without their review.
