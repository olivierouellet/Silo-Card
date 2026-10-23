# Security Policy · Sécurité

**[English](#english) · [Français](#français)**

---

## English

### Reporting a vulnerability

**Don't open a public issue.** Report privately through GitHub:

* [Report a vulnerability](https://github.com/olivierouellet/Silo-Card/security/advisories/new)
  from the repository's **Security** tab, visible only to the maintainer, or
* contact [@olivierouellet](https://github.com/olivierouellet) directly.

Useful to include: the version, what an attacker needs, and a way to reproduce it.

This is a one-maintainer, spare-time project. Expect acknowledgement within 2 weeks, and you'll
be told where the fix stands. Credit in the release notes if you'd like it.

### Supported versions

| Version | Supported |
| --- | --- |
| Latest release | ✅ |
| `main` | ✅ Fixes land here first |
| Earlier releases | ❌ Update through HACS |

### Attack surface

* The card reads one sensor from Home Assistant (with the Silo integration, its fill sensor and that sensor's source), and the name of its device. It makes no network request and stores nothing in the browser.
* Nothing it reads is inserted as HTML: Lit escapes all the text the card shows. The colour option is only used as a CSS value.

---

## Français

### Signaler une vulnérabilité

**N’ouvrez pas d’issue publique.** Signalez-la en privé par GitHub :

* [Signaler une vulnérabilité](https://github.com/olivierouellet/Silo-Card/security/advisories/new)
  dans l’onglet **Security** du dépôt, visible seulement par le responsable, ou
* écrivez directement à [@olivierouellet](https://github.com/olivierouellet).

Utile à inclure : la version, ce qu’il faut pour exploiter le problème, et une façon de le reproduire.

C’est un projet à un seul responsable, fait sur son temps libre. Comptez un accusé de réception
d’ici deux semaines; vous saurez où en est la correction. Vous serez crédité dans les notes de
version si vous le souhaitez.

### Versions prises en charge

| Version | Prise en charge |
| --- | --- |
| Dernière version publiée | ✅ |
| `main` | ✅ Les correctifs y arrivent d’abord |
| Versions antérieures | ❌ Mettez à jour avec HACS |

### Surface d’attaque

* La carte lit un capteur de Home Assistant (avec l’intégration Silo, son capteur de remplissage et la source de ce capteur), et le nom de son appareil. Elle ne fait aucune requête réseau et ne garde rien dans le navigateur.
* Rien de ce qu’elle lit n’est inséré comme HTML : Lit échappe tout le texte affiché. L’option de couleur ne sert que de valeur CSS.
