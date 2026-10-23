# Contributing · Contribuer

**[English](#english) · [Français](#français)**

---

## English

Thanks for your interest! By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Using AI tools? Read the [AI policy](AI_POLICY.md).
Issues and pull requests are welcome in English or French.

### Setup

```bash
corepack enable
yarn install
yarn build   # lint, translations, type check, tests, then dist/silo-card.js
yarn start   # test page at http://localhost:5050/ (?dark&lang=fr&width=320&only=editor)
```

The test page draws several silos (hopper bins, a flat-floor bin, a tower silo, a square bin) from a mock
Home Assistant, with a slider to fill them.

### Conventions

* **Interface text**: `src/localize/languages/en.json` is the reference: `yarn lint` checks that `fr.json`
  has the same keys and `{placeholders}`.
* **Documentation** is bilingual, English then French.
* **Geometry**: `src/geometry.ts` works in metres and has its own tests; a new shape comes with tests of its
  volume against the textbook formula.
* **Commits**: `[Topic] What changed`, one topic each (for example `[Card]`, `[Docs]`, `[Tooling]`).

---

## Français

Merci de votre intérêt! En participant, vous acceptez le [code de conduite](CODE_OF_CONDUCT.md). Vous utilisez l’IA? Lisez la [politique sur l’IA](AI_POLICY.md).
Les issues et les demandes de tirage sont bienvenues en anglais ou en français.

### Installation

```bash
corepack enable
yarn install
yarn build   # lint, traductions, vérification des types, tests, puis dist/silo-card.js
yarn start   # page de test sur http://localhost:5050/ (?dark&lang=fr&width=320&only=editor)
```

La page de test dessine plusieurs silos (cellules à trémie, cellule à fond plat, silo-tour, cellule carrée)
à partir d’un Home Assistant simulé, avec un curseur pour les remplir.

### Conventions

* **Textes de l’interface** : `src/localize/languages/en.json` est la référence : `yarn lint` vérifie que
  `fr.json` a les mêmes clés et les mêmes `{variables}`.
* **La documentation** est bilingue, l’anglais puis le français.
* **Géométrie** : `src/geometry.ts` travaille en mètres et a ses propres tests; une nouvelle forme vient avec
  des tests de son volume selon la formule connue.
* **Commits** : `[Sujet] Ce qui a changé`, un sujet par commit (par exemple `[Card]`, `[Docs]`, `[Tooling]`).
