# Les Échos du Vivant · contrat de la première Assemblée

## Deux origines

La note [The last dialogue dans Capacities](https://app.capacities.io/dd117a29-7e81-46cb-9d8e-0d195fac7034/4cceab56-bd16-4dc1-baa6-67c97b79af0f), mise à jour le 23 février 2026, envisageait deux entités IA qui confient leur recherche documentaire à des humains. Le Deep Searcher devait jouer en duel, par tours hebdomadaires ou bimensuels. Le Journalist devait composer avec d’autres joueurs et un journaliste IA un article par quinzaine, évalué par un LLM. Les auteurs souhaitaient centraliser la documentation dans le dépôt.

La [V1 fusionnée le 25 novembre](https://github.com/LaurentHuzard/the-last-dialogue/pull/1) a installé deux temps. En 2026 on enquête, en 2235 une Assemblée fictive décide. Une archive modifie les connaissances des délégués. L’histoire réelle de la forêt reste hors du pouvoir du joueur. La mention « brouillon » de l’ancienne description précède la fusion. Ses tests simulés documentent la V1.

## Une séance solo

Le dispensaire perd du courant pendant les gardes. Le trait rouge qui doit l’alimenter coupe la lisière d’une forêt ancienne. Tu as une voix au conseil et la charge de l’enquête.

| Moment | Action et mémoire |
| --- | --- |
| Ouverture | Sélène interpelle Ivo sur le passage de la lisière. Ivo accepte d’examiner un détour si le dispensaire conserve son alimentation, quitte à décaler le travail des ateliers. Le registre conserve son engagement. |
| Enquête Deep Searcher | Lire les deux pièces fictives disponibles sur l’appareil ou décrire un document ou une observation de 2026. Choisir une pièce, nommer sa limite et décider si une contre-lecture doit précéder la décision. |
| Retour | Ada relit la pièce et sa limite. Ivo répond à propos de son engagement. Inscrire une seule motion parmi le sanctuaire, le corridor alternatif et la construction. |
| Scrutin | Soutenir la motion ou proposer un autre tracé au vote. Le choix porte la voix du joueur. Trois voix sur quatre emportent la décision. |
| Lendemain | Relire le résultat, chaque voix, la pièce et la conséquence dans le procès-verbal local. |

L’engagement narratif d’Ivo est conditionnel. L’inscription de la motion précise quelle option a été négociée. La pièce ouvre à Ada une voix procédurale. Elle soutient un dossier dont la réserve est consignée, ou vote contre si le joueur demande une contre-lecture préalable. Aucun lien n’est inspecté automatiquement. Les répliques générées, comme les questions libres, restent des interprétations. Le moteur accepte uniquement dépôt, motion et vote dans cet ordre.

## Démonstration et parcours comparés

Pour une démo courte, entrer en voix scénarisées, lire le carnet de lisière, le verser avec sa limite, négocier le corridor alternatif, puis le soutenir. Relire le lendemain et rouvrir l’application.

| Pièce et traitement | Motion → vote | Voix et conséquence |
| --- | --- | --- |
| Carnet de lisière, réserve consignée | Corridor alternatif → corridor alternatif | 4/4. Sélène garde la lisière, Ivo sécurise le dispensaire, Ada reconnaît la réserve. Les ateliers perdent plusieurs nuits de travail. |
| Même carnet, même traitement | Corridor alternatif → construction | 2/4. Toi et Ada soutenez le scrutin. Sélène refuse la coupure, Ivo n’a pas négocié cette construction. Les groupes de secours tournent encore et la lisière reste sans protection durable. |
| Registre de garde, réserve consignée | Construction → construction | 3/4. Ivo et Ada suivent le joueur. Le dispensaire gagne du courant au prix d’une lisière fragmentée. |
| Même registre, contre-lecture demandée | Construction → construction | 2/4. Ada attend la contre-lecture demandée. Son bulletin fait basculer le résultat. |

## Playtest et suite

La cible de 10 à 15 minutes exclut la recherche extérieure libre et l’attente du modèle. Une exécution automatisée vérifie le chemin. La durée de lecture, le plaisir et la compréhension demandent un playtest humain. Après fermeture, demander au joueur de nommer une concession, de dire pourquoi sa pièce comptait et d’identifier qui paie le prix de son vote.

1. **Observer trois premières séances solo.** Relever les temps, les hésitations et les trois réponses de chaque joueur, puis corriger le premier point d’incompréhension récurrent.
2. **Vérifier la mise à jour de l’application.** Installer deux versions signées avec la même clé sur un appareil de test et retrouver la pièce, les deux échanges et les quatre bulletins après mise à jour.
3. **Éprouver l’interprétation documentaire.** Comparer deux pistes aux limites différentes avec des joueurs et vérifier qu’ils distinguent provenance déclarée, portée de la pièce et coût du choix.
4. **Essayer une chronique Journalist locale.** Permettre de réviser un court récit issu du registre et démontrer qu’une édition laisse les événements et le verdict identiques.

Les duels, les échéances calendaires, le journalisme collaboratif en ligne, la vérification scientifique automatique, les agents permanents, les chapitres suivants, les comptes et l’hébergement public restent ouverts pour la suite.

### Ce qui a été joué pour la PR de campagne

Sur l’export statique, Chromium à 390 × 844 a donné 4/4 puis 2/4 avec la même pièce et le même détour négocié. À 360 × 740 avec mouvement réduit, le parcours entièrement au clavier a versé une archive personnelle, demandé la contre-lecture et retrouvé le rejet de la construction après réouverture. Aucun appel externe pendant ces parcours scénarisés. Dans un autre profil, une réponse MUE simulée arrivée après annulation a été écartée. Le test du prototype web a traversé le vrai FastAPI du dépôt à la négociation puis au vote. La mesure sur le fournisseur, le parcours joué sur Galaxy et la procédure de reproduction figurent dans le [guide MUE](mue-tailscale.md).

Les contrôles par révision et le téléchargement de l’APK debug sont accessibles depuis la [PR de campagne](https://github.com/LaurentHuzard/the-last-dialogue/pull/2).
