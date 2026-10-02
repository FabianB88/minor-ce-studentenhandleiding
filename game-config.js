/* Configuratie voor gedeelde highscores.
   Laat leeg (null) om alleen lokale scores te gebruiken.
   Vul in met de webconfig van een Firebase-project (Spark-plan) waarin Firestore aanstaat;
   de bijbehorende beveiligingsregels staan in firebase/firestore.rules. */
window.LG_FIREBASE = null;
/* Voorbeeld:
window.LG_FIREBASE = {
  apiKey: '...',
  authDomain: 'project.firebaseapp.com',
  projectId: 'project',
  appId: '...',
  collectie: 'learninggame_scores'
};
*/
