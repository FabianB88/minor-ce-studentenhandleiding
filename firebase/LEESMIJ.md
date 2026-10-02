# Gedeeld scorebord aanzetten

Zonder configuratie bewaart de learning game scores in de browser van de speler. Wil je één scorebord voor de hele klas, dan heb je een Firebase-project nodig (Spark-plan, gratis) met Firestore.

1. Maak in de Firebase-console een project aan (of gebruik een bestaand project) en zet Firestore aan in regio `eur3` of `europe-west4`.
2. Zet de regels uit `firestore.rules` in dit mapje op de database. Ze staan toe dat iedereen scores leest en toevoegt, maar niets wijzigt of verwijdert, en ze controleren de vorm van elk document.
3. Maak in de console een web-app aan en kopieer de configuratie naar `game-config.js` in de hoofdmap (vervang `null` door het object; `collectie` mag blijven staan).
4. Firestore heeft voor de query een samengestelde index nodig op `modus` (oplopend), `score` (aflopend), `tijd` (oplopend). Bij het eerste gebruik geeft de browserconsole een link waarmee je die index in één klik aanmaakt.

Daarna toont het scorebord op game.html de gedeelde top tien per spelvorm, met het wereldbol-icoontje eronder.
