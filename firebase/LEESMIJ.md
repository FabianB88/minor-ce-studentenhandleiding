# Gedeeld scorebord

Het scorebord van de learning game staat in Firestore van het Firebase-project `portfolio-minor-ce` (Spark-plan, gratis), collectie `learninggame_scores`. De webconfig staat in `game-config.js` in de hoofdmap; zet die op `null` om terug te vallen op lokale scores.

De beveiligingsregels staan in `firestore.rules` hier (ter referentie) en zijn gedeployd vanuit de repo `portfolio-ce`, waar de rules van het hele project leven. Ze staan toe dat iedereen scores leest en toevoegt, maar niets wijzigt of verwijdert, en ze controleren de vorm van elk document.

De lijst wordt opgehaald met alleen een filter op spelvorm en daarna in de browser gesorteerd, zodat er geen samengestelde index nodig is.
