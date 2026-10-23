<p align="center">
  <img src="https://raw.githubusercontent.com/olivierouellet/Silo-Card/main/images/icon.svg" alt="Silo Card logo" width="128" height="128">
</p>

<h1 align="center">Silo Card</h1>

<p align="center"><b><a href="#english">English</a> · <a href="#français">Français</a></b></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/olivierouellet/Silo-Card/main/images/screenshot-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/olivierouellet/Silo-Card/main/images/screenshot-light.png">
    <img src="https://raw.githubusercontent.com/olivierouellet/Silo-Card/main/images/screenshot-light.png" alt="Silo Card: a hopper bin in short tons, a flat-floor bin of corn in bushels that is running low, and a hopper bin of wheat in French" width="800">
  </picture>
</p>

---

## English

A Home Assistant dashboard card that draws your grain silo or bin to scale, **section by section**, and fills it to the level a sensor measures.

- Describe your silo once: round or square, a **cone (pointed or with a flat lid), dome or flat roof**, the **rings** of the wall, and a **flat floor or cone hopper** (pointed, or ending in an outlet).
- The hopper, every ring and the roof are drawn as separate sections. Hover one to see how full it is.
- From a **distance sensor at the top** (an ultrasonic sensor on ESPHome, for example), or any sensor giving the grain's height.
- Shows the percentage full, the **weight**, the **room left** (what to order), the grain height, where the grain is (“4.3 of 7 rings”), the volume, and the distance from the sensor.
- Weight from the **grain** (standard bushel weights for wheat, corn, barley, oats, soybeans, canola…), your own **density**, or the manufacturer's **capacity**.
- Metric or imperial, and a unit for each length if you like (feet for the bin, inches for the rings): metres, centimetres, millimetres, feet or inches; tonnes, short tons, kilograms or pounds; m³, litres, ft³ or bushels.
- A choice of four grain textures: stipple, layers, shading or hatching.
- Turns the warning colour under a level you choose.
- A visual editor, with a **Tiles** list: drag a tile's handle to reorder the lines beside the silo, and switch each one on or off. **English and French**, following Home Assistant's language or set per card. Follows your theme (light and dark).

### Two ways to use it

1. **With the [Silo integration](https://github.com/olivierouellet/Silo) (recommended).** Describe the silo once, in the integration, and pick its *Fill level* sensor in the card: the card reads the silo's shape and contents from it, so there is nothing to enter twice. You also get sensors for the weight and the room left, with their history, for automations.
2. **On its own.** Pick the distance sensor and describe the silo in the card editor. The numbers are then only on the dashboard.

### The sensor

The silo's geometry is done by the integration or the card, so the sensor only has to measure the distance down to the grain. [`examples/esphome/`](examples/esphome/) is a complete ESPHome configuration for an ESP32-C3 and a MaxBotix HRXL-MaxSonar-WR ultrasonic sensor (TTL output), with the external component that reads it: it filters the readings and reports the distance in metres. The same firmware fits every silo; only `sensor_height` changes.

The card reads the sensor in whatever length unit it reports (mm, cm, m, in, ft). Mount the sensor at the top, pointing straight down, away from the fill tube and the walls.

### Installation

**With HACS (recommended)**

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=olivierouellet&repository=Silo-Card&category=plugin)

1. In Home Assistant, open **HACS** → **⋮** (top right) → **Custom repositories**.
2. Repository: `https://github.com/olivierouellet/Silo-Card`, type: **Dashboard**, then **Add**. (The button above does steps 1 and 2 for you.)
3. Search for **Silo Card**, open it and click **Download**. HACS adds the dashboard resource for you.
4. Reload your browser (or restart the Home Assistant app).

**Manual**

1. Download `silo-card.js` from the latest release (or build it: `yarn install && yarn build`, then use `dist/silo-card.js`).
2. Copy it to `config/www/`.
3. *Settings → Dashboards → ⋮ → Resources → Add resource*: URL `/local/silo-card.js`, type **JavaScript module**.

Then add the card from the card picker (search for “Silo”).

### Measuring your silo

```text
       ▄▄▄ sensor   top_opening      (the lid)
      ╱   ╲         top_height       (roof: cone, dome or flat)
      ├───┤  ─┐
      │   │   │
      ├───┤   │     rings × ring_height
      │   │   │
      ├───┤  ─┘
       ╲ ╱          bottom_height    (bottom: cone hopper, or flat)
        ▔           outlet
      ◄───►
     diameter
```

Every length is in `unit`, or in its own unit (`ring_height_unit: in`…): mix them as on the manufacturer's sheet. The silo's lowest point (the floor, or the tip of the hopper) is height 0. By default the sensor is at the very top of the roof; if it is lower (in a hatch, for example), set `sensor_height`.

Full means filled to the eave, the top of the wall, which is how most bins are rated; the grain that fills the roof then shows above 100 %. Set `include_roof: true` to count the roof as part of the capacity.

### Options

| Option | Default | Description |
|---|---|---|
| `entity` | — | The Silo integration's *Fill level* sensor, or the sensor that measures the grain. With the integration, the options from `measure` to `include_roof` come from it, and the card ignores them. |
| `measure` | `distance` | `distance`: the sensor measures from the top down to the grain. `level`: it gives the grain's height. |
| `sensor_height` | top of the silo | Height of the sensor above the silo's lowest point, with `measure: distance`. |
| `unit` | `m` | Default unit of the lengths: `m`, `cm`, `mm`, `ft` or `in`. |
| `diameter_unit`, `ring_height_unit`, `top_height_unit`, `bottom_height_unit`, `outlet_unit`, `sensor_height_unit` | `unit` | A length's own unit, when it isn't the default one: enter the silo as the manufacturer gives it (`unit: ft`, `ring_height: 32`, `ring_height_unit: in`). |
| `shape` | `round` | Cross-section: `round` or `square` (then `diameter` is the side). |
| `diameter` | — | **Required.** Width of the wall. |
| `rings` | `1` | Number of rings in the wall. A plain wall is 1 ring as tall as the wall. |
| `ring_height` | — | **Required.** Height of one ring. |
| `top` | `cone` | Roof: `cone`, `dome` or `flat`. |
| `top_height` | `0` | Height of the roof. |
| `top_opening` | `0` | Diameter of the flat lid at the top of a cone roof; 0 when it comes to a point. |
| `bottom` | `flat` | Bottom: `flat` floor or `cone` hopper. |
| `bottom_height` | `0` | Height of the hopper. |
| `outlet` | `0` | Diameter at the bottom of the hopper; 0 when it comes to a point. |
| `grain` | — | `wheat`, `corn`, `barley`, `oats`, `soybeans`, `canola`, `rye`, `peas`, `flax` or `sorghum`. Shown under the title, and gives the density (the standard bushel weight). |
| `density` | from `grain` | Bulk density, in `density_unit`. Your own test weight is more accurate than the standard one. |
| `density_unit` | `kg/m3` | `kg/m3`, `kg/hL`, `lb/bu` or `lb/ft3`. |
| `capacity` | — | Weight when full, in `weight_unit`, from the manufacturer. Replaces `density`. |
| `capacity_per` | `silo` | `silo`: `capacity` is the whole silo's. `ring`: it is one full ring's (“3 tons a ring”), and the hopper and roof get the weight of their own volume; a cone holds a third of a ring as tall. |
| `weight_unit` | `t` | `t` (tonnes), `ton` (short tons of 2000 lb), `kg` or `lb`. |
| `volume_unit` | `m3` | `m3`, `L`, `ft3` or `bu` (US bushels). |
| `include_roof` | `false` | Count the roof in the capacity (full at the peak instead of the eave). |
| `display_unit` | `unit` | Unit the card shows lengths in, when it isn't the one the silo was entered in: `m`, `cm`, `ft` or `in`. Works with the integration too. |
| `display_weight_unit` | `weight_unit` | Unit the card shows weights in: `t`, `kg`, `ton` or `lb`. |
| `display_volume_unit` | `volume_unit` | Unit the card shows volumes in: `m3`, `L`, `ft3` or `bu`. |
| `low_level` | `20` | Percentage under which the grain is drawn in the warning colour. `0` turns it off. |
| `title` | device name | Card title. |
| `icon` | `mdi:silo` | Header icon. |
| `color` | amber | Grain colour: a theme colour name (`amber`, `brown`, `green`…) or any CSS colour. |
| `primary` | `percent` | The big value at the top: `percent` (“59% full”) or any of the `rows` below, for example `rings` (“3.8 of 7 rings”, or “60% of the hopper”). Without a grain, density or capacity, `weight` and `remaining` show the fill instead. |
| `rows` | `[weight, remaining, level, rings]` | The lines beside the silo, in this order: `percent` (the fill), `weight` (needs a grain, density or capacity), `remaining` (room left, in weight), `volume`, `level` (grain height), `rings` (“4.3 of 7”, or how full the hopper or roof is) and `distance` (from the sensor down to the grain). |
| `texture` | `stipple` | Over the grain colour: `stipple` (fine dots), `layers` (soft wavy lines), `shaded` (no pattern: a round bin's shading) or `hatching` (thin 45° lines). |
| `labels` | `text` | `text`: each line's name. `icons`: an icon instead (the name shows on hover). |
| `layout` | `auto` | `auto`: the silo beside the numbers, above them when the card is narrow. `side` or `stacked` to choose. |
| `show_sensor` | `true` | Draw the sensor and its beam. |
| `language` | `auto` | `auto` (Home Assistant's language), `en` or `fr`. |

Tap the card to open the sensor's history.

In a sections view the card is as tall as it needs (*Auto height* in the *Layout* tab). Given a fixed height there instead, it draws the silo smaller to fit, down to 3 rows. When the card is narrow, the silo goes above the numbers.

### Examples

With the Silo integration, the silo comes from its sensor:

```yaml
type: custom:silo-card
entity: sensor.soue_1_ben_2_fill_level
primary: rings               # “3.8 of 7 rings” as the big value
rows: [percent, remaining, weight]
display_unit: m              # the silo was entered in inches
display_weight_unit: t       # and its capacity in short tons
```

On its own, a hopper bin as on the manufacturer's sheet (in feet, with 32-inch rings), and its capacity of 3 short tons a ring:

```yaml
type: custom:silo-card
entity: sensor.bin_1_distance
unit: ft
diameter: 9
rings: 7
ring_height: 32
ring_height_unit: in
top_height: 2
bottom: cone
bottom_height: 7
capacity: 3
capacity_per: ring
weight_unit: ton
```

A flat-floor bin of corn, in feet and bushels:

```yaml
type: custom:silo-card
entity: sensor.bin_3_distance
unit: ft
diameter: 27
rings: 8
ring_height: 2.67
top_height: 7.5
grain: corn
weight_unit: ton
volume_unit: bu
rows: [weight, remaining, volume, level, rings]
```

A tower silo with a dome, from a level sensor:

```yaml
type: custom:silo-card
entity: sensor.tower_level
measure: level
diameter: 6
ring_height: 18
top: dome
top_height: 2.5
grain: barley
```

### How accurate is it?

The card computes the volume exactly for the shape you describe, but the grain isn't flat: it heaps into a cone under the fill tube and hollows into a funnel as it empties, and the sensor sees a single spot. Expect the weight to be off by a few percent, more in wide bins. Grain density also varies with the crop, its moisture and its quality: for the weight, the manufacturer's capacity or your own test weight beats the standard bushel weight.

Without the integration, the numbers are shown on the dashboard only. For automations (say, a notification when a bin runs low), use the [Silo integration](https://github.com/olivierouellet/Silo)'s sensors.

### Development

- `yarn install`, then `yarn build` (lint, translations, type check, tests, bundle to `dist/`).
- `yarn start` rebuilds on change and serves on port 5050 (not 5000, which macOS uses for AirPlay):
  - `http://localhost:5050/` is a test page with a mock Home Assistant: several silos, a fill slider, light/dark, EN/FR, phone width and the editor. URL options: `?dark&lang=fr&width=320&only=editor`.
  - Add `http://<your-computer>:5050/silo-card.js` as a dashboard resource to try the live build in Home Assistant.
- See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

---

## Français

Une carte de tableau de bord Home Assistant qui dessine votre silo ou votre cellule à grains à l’échelle, **section par section**, et la remplit jusqu’au niveau mesuré par un capteur.

- Décrivez votre silo une fois : rond ou carré, un **toit en cône (en pointe ou avec un couvercle plat), en dôme ou plat**, les **sections** de la paroi, et un **plancher plat ou une trémie en cône** (en pointe ou avec une sortie).
- La trémie, chaque section et le toit sont dessinés séparément. Survolez-en une pour voir à quel point elle est pleine.
- À partir d’un **capteur de distance en haut** (un capteur à ultrasons sur ESPHome, par exemple), ou de tout capteur qui donne la hauteur du grain.
- Affiche le pourcentage de remplissage, le **poids**, la **place libre** (ce qu’il faut commander), la hauteur du grain, où se trouve le grain (« 4,3 sur 7 sections »), le volume et la distance depuis le capteur.
- Le poids vient du **grain** (poids standard du boisseau pour le blé, le maïs, l’orge, l’avoine, le soya, le canola…), de votre propre **masse volumique**, ou de la **capacité** du fabricant.
- Métrique ou impérial, et une unité pour chaque longueur au besoin (des pieds pour la cellule, des pouces pour les sections) : mètres, centimètres, millimètres, pieds ou pouces; tonnes, tonnes courtes, kilogrammes ou livres; m³, litres, pi³ ou boisseaux.
- Quatre textures de grain au choix : pointillé, couches, ombrage ou hachures.
- Passe à la couleur d’avertissement sous le niveau de votre choix.
- Un éditeur visuel, avec une liste de **Tuiles** : glissez la poignée d’une tuile pour changer l’ordre des lignes à côté du silo, et affichez ou masquez chacune avec son interrupteur. **Français et anglais**, selon la langue de Home Assistant ou choisi pour chaque carte. Respecte votre thème (clair ou sombre).

### Deux façons de l’utiliser

1. **Avec l’[intégration Silo](https://github.com/olivierouellet/Silo#français) (recommandé).** Décrivez le silo une seule fois, dans l’intégration, et choisissez son capteur *Taux de remplissage* dans la carte : la carte y lit la forme et le contenu du silo, rien à entrer deux fois. Vous obtenez aussi des capteurs pour le poids et la place libre, avec leur historique, pour vos automatisations.
2. **Seule.** Choisissez le capteur de distance et décrivez le silo dans l’éditeur de la carte. Les valeurs ne sont alors que sur le tableau de bord.

### Le capteur

La géométrie du silo est faite par l’intégration ou par la carte : le capteur n’a qu’à mesurer la distance jusqu’au grain. [`examples/esphome/`](examples/esphome/) est une configuration ESPHome complète pour un ESP32-C3 et un capteur à ultrasons MaxBotix HRXL-MaxSonar-WR (sortie TTL), avec le composant externe qui le lit : elle filtre les mesures et transmet la distance en mètres. Le même micrologiciel convient à tous les silos; seul `sensor_height` change.

La carte lit le capteur dans l’unité de longueur qu’il utilise (mm, cm, m, po, pi). Installez le capteur en haut, pointé droit vers le bas, loin du tuyau de remplissage et des parois.

### Installation

**Avec HACS (recommandé)**

[![Ouvrir votre instance Home Assistant et ce dépôt dans HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=olivierouellet&repository=Silo-Card&category=plugin)

1. Dans Home Assistant, ouvrez **HACS** → **⋮** (en haut à droite) → **Dépôts personnalisés**.
2. Dépôt : `https://github.com/olivierouellet/Silo-Card`, type : **Dashboard** (tableau de bord), puis **Ajouter**. (Le bouton ci-dessus fait les étapes 1 et 2 pour vous.)
3. Cherchez **Silo Card**, ouvrez-la et cliquez sur **Télécharger**. HACS ajoute la ressource du tableau de bord pour vous.
4. Rechargez votre navigateur (ou redémarrez l’application Home Assistant).

**Manuelle**

1. Téléchargez `silo-card.js` depuis la dernière version publiée (ou compilez-le : `yarn install && yarn build`, puis prenez `dist/silo-card.js`).
2. Copiez-le dans `config/www/`.
3. *Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter une ressource* : URL `/local/silo-card.js`, type **Module JavaScript**.

Ajoutez ensuite la carte depuis le sélecteur de cartes (cherchez « Silo »).

### Mesurer votre silo

```text
       ▄▄▄ capteur  top_opening      (le couvercle)
      ╱   ╲         top_height       (toit : cône, dôme ou plat)
      ├───┤  ─┐
      │   │   │
      ├───┤   │     rings × ring_height (sections × hauteur d’une section)
      │   │   │
      ├───┤  ─┘
       ╲ ╱          bottom_height    (fond : trémie en cône, ou plat)
        ▔           outlet (sortie)
      ◄───►
     diameter (diamètre)
```

Toutes les longueurs sont dans l’unité `unit`, ou dans leur propre unité (`ring_height_unit: in`…) : mélangez-les comme sur la fiche du fabricant. Le point le plus bas du silo (le plancher, ou la pointe de la trémie) est la hauteur 0. Par défaut, le capteur est tout en haut du toit; s’il est plus bas (dans une trappe, par exemple), entrez `sensor_height`.

Plein veut dire rempli jusqu’au bas du toit, le haut de la paroi, comme la capacité de la plupart des cellules; le grain qui remplit le toit s’affiche alors au-delà de 100 %. Avec `include_roof: true`, le toit compte dans la capacité.

### Options

| Option | Défaut | Description |
|---|---|---|
| `entity` | — | Le capteur *Taux de remplissage* de l’intégration Silo, ou le capteur qui mesure le grain. Avec l’intégration, les options de `measure` à `include_roof` viennent d’elle, et la carte les ignore. |
| `measure` | `distance` | `distance` : le capteur mesure du haut jusqu’au grain. `level` : il donne la hauteur du grain. |
| `sensor_height` | haut du silo | Hauteur du capteur au-dessus du point le plus bas du silo, avec `measure: distance`. |
| `unit` | `m` | Unité par défaut des longueurs : `m`, `cm`, `mm`, `ft` (pieds) ou `in` (pouces). |
| `diameter_unit`, `ring_height_unit`, `top_height_unit`, `bottom_height_unit`, `outlet_unit`, `sensor_height_unit` | `unit` | L’unité propre d’une longueur, si ce n’est pas celle par défaut : entrez le silo comme le fabricant le donne (`unit: ft`, `ring_height: 32`, `ring_height_unit: in`). |
| `shape` | `round` | Section horizontale : `round` (ronde) ou `square` (carrée; `diameter` est alors le côté). |
| `diameter` | — | **Obligatoire.** Largeur de la paroi. |
| `rings` | `1` | Nombre de sections de la paroi. Une paroi simple compte pour 1 section de toute sa hauteur. |
| `ring_height` | — | **Obligatoire.** Hauteur d’une section. |
| `top` | `cone` | Toit : `cone`, `dome` ou `flat` (plat). |
| `top_height` | `0` | Hauteur du toit. |
| `top_opening` | `0` | Diamètre du couvercle plat en haut d’un toit en cône; 0 s’il finit en pointe. |
| `bottom` | `flat` | Fond : plancher plat (`flat`) ou trémie en cône (`cone`). |
| `bottom_height` | `0` | Hauteur de la trémie. |
| `outlet` | `0` | Diamètre au bas de la trémie; 0 si elle finit en pointe. |
| `grain` | — | `wheat` (blé), `corn` (maïs), `barley` (orge), `oats` (avoine), `soybeans` (soya), `canola`, `rye` (seigle), `peas` (pois), `flax` (lin) ou `sorghum` (sorgho). Affiché sous le titre, et donne la masse volumique (le poids standard du boisseau). |
| `density` | selon `grain` | Masse volumique, dans l’unité `density_unit`. Votre propre poids spécifique est plus juste que le poids standard. |
| `density_unit` | `kg/m3` | `kg/m3`, `kg/hL`, `lb/bu` ou `lb/ft3`. |
| `capacity` | — | Poids quand le silo est plein, dans l’unité `weight_unit`, selon le fabricant. Remplace `density`. |
| `capacity_per` | `silo` | `silo` : `capacity` est celle du silo entier. `ring` : c’est celle d’une section pleine (« 3 tonnes par section »), et la trémie et le toit prennent le poids de leur propre volume; un cône contient le tiers d’une section de même hauteur. |
| `weight_unit` | `t` | `t` (tonnes métriques), `ton` (tonnes courtes de 2000 lb), `kg` ou `lb`. |
| `volume_unit` | `m3` | `m3`, `L`, `ft3` (pieds cubes) ou `bu` (boisseaux américains). |
| `include_roof` | `false` | Compter le toit dans la capacité (plein au sommet plutôt qu’au bas du toit). |
| `display_unit` | `unit` | Unité des longueurs affichées par la carte, si ce n’est pas celle dans laquelle le silo a été entré : `m`, `cm`, `ft` ou `in`. Fonctionne aussi avec l’intégration. |
| `display_weight_unit` | `weight_unit` | Unité des poids affichés : `t`, `kg`, `ton` ou `lb`. |
| `display_volume_unit` | `volume_unit` | Unité des volumes affichés : `m3`, `L`, `ft3` ou `bu`. |
| `low_level` | `20` | Pourcentage sous lequel le grain est dessiné dans la couleur d’avertissement. `0` le désactive. |
| `title` | nom de l’appareil | Titre de la carte. |
| `icon` | `mdi:silo` | Icône de l’en-tête. |
| `color` | ambre | Couleur du grain : un nom de couleur du thème (`amber`, `brown`, `green`…) ou toute couleur CSS. |
| `primary` | `percent` | La grande valeur en haut : `percent` (« 59 % plein ») ou n’importe laquelle des lignes `rows` ci-dessous, par exemple `rings` (« 3,8 sur 7 sections », ou « 60 % de la trémie »). Sans grain, masse volumique ni capacité, `weight` et `remaining` affichent plutôt le remplissage. |
| `rows` | `[weight, remaining, level, rings]` | Les lignes à côté du silo, dans cet ordre : `percent` (le remplissage), `weight` (poids; il faut un grain, une masse volumique ou une capacité), `remaining` (place libre, en poids), `volume`, `level` (hauteur du grain), `rings` (« 4,3 sur 7 » sections, ou à quel point la trémie ou le toit est plein) et `distance` (entre le capteur et le grain). |
| `texture` | `stipple` | Par-dessus la couleur du grain : `stipple` (pointillé), `layers` (couches ondulées), `shaded` (sans motif : l’ombrage d’une cellule ronde) ou `hatching` (hachures fines à 45°). |
| `labels` | `text` | `text` : le nom de chaque ligne. `icons` : une icône à la place (le nom s’affiche au survol). |
| `layout` | `auto` | `auto` : le silo à côté des valeurs, au-dessus quand la carte est étroite. `side` ou `stacked` pour choisir. |
| `show_sensor` | `true` | Dessiner le capteur et son faisceau. |
| `language` | `auto` | `auto` (langue de Home Assistant), `en` ou `fr`. |

Touchez la carte pour ouvrir l’historique du capteur.

Dans une vue en sections, la carte prend la hauteur qu’il lui faut (*Hauteur automatique* dans l’onglet *Mise en page*). Avec une hauteur fixe, elle dessine le silo plus petit pour s’y loger, jusqu’à 3 rangées. Quand la carte est étroite, le silo passe au-dessus des valeurs.

### Exemples

Avec l’intégration Silo, le silo vient de son capteur :

```yaml
type: custom:silo-card
entity: sensor.soue_1_ben_2_taux_de_remplissage
primary: rings               # « 3,8 sur 7 sections » en grand
rows: [percent, remaining, weight]
display_unit: m              # le silo a été entré en pouces
display_weight_unit: t       # et sa capacité en tonnes courtes
```

Seule, une cellule à trémie comme sur la fiche du fabricant (en pieds, avec des sections de 32 pouces), et sa capacité de 3 tonnes courtes par section :

```yaml
type: custom:silo-card
entity: sensor.cellule_1_distance
unit: ft
diameter: 9
rings: 7
ring_height: 32
ring_height_unit: in
top_height: 2
bottom: cone
bottom_height: 7
capacity: 3
capacity_per: ring
weight_unit: ton
```

Une cellule à fond plat pleine de maïs, en pieds et en boisseaux :

```yaml
type: custom:silo-card
entity: sensor.cellule_3_distance
unit: ft
diameter: 27
rings: 8
ring_height: 2.67
top_height: 7.5
grain: corn
weight_unit: ton
volume_unit: bu
rows: [weight, remaining, volume, level, rings]
language: fr
```

Un silo-tour avec un dôme, à partir d’un capteur de niveau :

```yaml
type: custom:silo-card
entity: sensor.silo_tour_niveau
measure: level
diameter: 6
ring_height: 18
top: dome
top_height: 2.5
grain: barley
```

### Quelle précision?

La carte calcule le volume exact de la forme que vous décrivez, mais le grain n’est pas plat : il forme un cône sous le tuyau de remplissage et un entonnoir quand il se vide, et le capteur n’en voit qu’un point. Le poids peut donc s’écarter de quelques pour cent, davantage dans les grandes cellules. La masse volumique du grain varie aussi selon la culture, son humidité et sa qualité : pour le poids, la capacité du fabricant ou votre propre poids spécifique valent mieux que le poids standard du boisseau.

Sans l’intégration, les valeurs ne sont affichées que sur le tableau de bord. Pour les automatisations (par exemple, un avis quand une cellule est presque vide), utilisez les capteurs de l’[intégration Silo](https://github.com/olivierouellet/Silo#français).

### Développement

- `yarn install`, puis `yarn build` (analyse, traductions, vérification des types, tests et paquet dans `dist/`).
- `yarn start` recompile à chaque modification et sert les fichiers sur le port 5050 (pas 5000, utilisé par AirPlay sur macOS) :
  - `http://localhost:5050/` est une page de test avec un Home Assistant simulé : plusieurs silos, un curseur de remplissage, clair/sombre, FR/EN, largeur de téléphone et l’éditeur. Options d’URL : `?dark&lang=fr&width=320&only=editor`.
  - Ajoutez `http://<votre-ordinateur>:5050/silo-card.js` comme ressource de tableau de bord pour essayer la version en développement dans Home Assistant.
- Voir [CONTRIBUTING.md](CONTRIBUTING.md) et [SECURITY.md](SECURITY.md).
