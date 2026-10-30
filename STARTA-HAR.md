# LUNCHKAMPEN – få hemsidan LIVE, steg för steg

Du behöver **ingen betald domän och inget eget webbhotell**. Hemsidan publiceras gratis via GitHub Pages och delar röster via Firebase (gratisplanen Spark, inom gränserna). Gör stegen i ordning. Räkna med två gratis konton: ett Google-konto och ett GitHub-konto.

## STEG 1 – Packa upp filerna

1. Ladda ned ZIP-filen och packa upp den (högerklicka → Extrahera alla / Dubbelklicka på Mac).
2. Öppna mappen `lunchkampen`. Du ska se: `index.html`, `style.css`, `app.js`, `firebase-config.js`, `firestore.rules`, `lunchkampen-logo.webp` och denna guide.
3. **Ladda upp själva filerna**, inte en ZIP-fil eller den yttre mappen, när du kommer till GitHub-steget.

## STEG 2 – Skapa ett Firebase-projekt

1. Besök https://console.firebase.google.com/ och logga in med ett Google-konto.
2. Välj **Create a project / Skapa projekt**, döp projektet till t.ex. `lunchkampen-dittnamn` (namnet behöver vara ledigt).
3. Om du tillfrågas om Google Analytics går det bra att **stänga av** Analytics. Avsluta projektguiden.
4. Välj gratisplanen **Spark**. Om det står något om betalning eller fakturering: avbryt och välj gratisalternativet.

## STEG 3 – Registrera en webbapp och kopiera konfigurationen

1. I Firebase-projektets översikt, klicka på webbikonen **`</>`** (lägg till webbapp).
2. Ge appen ett namn, t.ex. `Lunchkampen`. Kryssa **inte** i Firebase Hosting – vi använder GitHub Pages.
3. Klicka **Register app**.
4. Leta upp kodavsnittet med `const firebaseConfig = { ... }` och fälten `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
5. Öppna filen `firebase-config.js` i Anteckningar/TextEdit/VS Code. Ersätt platshållarna med **exakt de värden du fick**. Behåll citattecken, komman och `export const firebaseConfig =`.
6. Spara filen. Exempel på hur formatet ska se ut (de här EXEMPELVÄRDENA fungerar inte):

```js
export const firebaseConfig = {
  apiKey: "AIza...fran-ditt-projekt",
  authDomain: "dittprojekt.firebaseapp.com",
  projectId: "dittprojekt",
  storageBucket: "dittprojekt.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcd"
};
```

**Viktigt:** Webbappens vanliga Firebase-konfiguration är tänkt för klientkod. Lägg däremot **aldrig** service-account-nycklar, lösenord eller privata API-hemligheter i GitHub.

## STEG 4 – Aktivera anonym inloggning i Firebase

1. Firebase-menyn → **Build → Authentication** (ibland bara Authentication).
2. Klicka **Get started** om det behövs.
3. Fliken **Sign-in method** → välj **Anonymous / Anonym**.
4. Aktivera **Enable** och tryck **Save**.

Detta är en teknisk anonym koppling för varje webbläsare. Kollegorna behöver inte skapa konton och skriver bara namn på hemsidan.

## STEG 5 – Skapa databasen och skydda rösterna

1. Firebase-menyn → **Build → Firestore Database** → **Create database**.
2. Välj en databasplats i Europa om det erbjuds, gärna nära Sverige. Välj **Standard** och **Production mode** om dessa val visas.
3. Skapa databasen och öppna fliken **Rules / Regler**.
4. Öppna `firestore.rules` i den uppackade mappen. Markera **all text** och kopiera.
5. Markera all text i Firebase-regelredigeraren och klistra in innehållet från `firestore.rules` i stället.
6. Klicka **Publish / Publicera**. Vänta tills reglerna har publicerats.

**Hoppa inte över detta steg.** Reglerna hindrar bland annat att en befintlig röst under samma namn skrivs över.

## STEG 6 – Ladda upp sidan på GitHub

1. Gå till https://github.com/ och registrera ett gratis konto eller logga in.
2. Klicka **New repository** (eller **+ → New repository**).
3. Repository name: `lunchkampen`. Välj **Public** (för gratis GitHub Pages på gratis konton). Klicka **Create repository**.
4. Välj **uploading an existing file** eller **Add file → Upload files**.
5. Dra in **alla filerna från mappen** (`index.html`, `style.css`, `app.js`, `firebase-config.js`, `firestore.rules`, `lunchkampen-logo.webp`, `STARTA-HAR.md`). Ingen undermapp får ligga mellan repositoryts rot och `index.html`.
6. Tryck **Commit changes** för att spara filerna.

## STEG 7 – Publicera via GitHub Pages

1. På ditt GitHub-repository: välj **Settings**.
2. I vänstermenyn: välj **Pages**.
3. Under **Build and deployment → Source**, välj **Deploy from a branch**.
4. Under **Branch** välj **main** och mappen **/(root)**, tryck **Save**.
5. När GitHub har publicerat sidan visas adressen under **Settings → Pages → Visit site**. Den brukar se ut ungefär så här:

`https://DITT-GITHUB-NAMN.github.io/lunchkampen/`

Du behöver inte köpa en domän. Sidan är nu publik för alla med länken.

## STEG 8 – Testa att allt fungerar

1. Öppna webbplatsen och kontrollera att det står **Ansluten – röster delas direkt med alla kollegor**.
2. Skriv ditt namn, välj en restaurang och klicka på **LÄGG MIN RÖST**.
3. Kontrollera att restaurangen får en röst och går upp i resultatlistan.
4. Testa från en annan enhet eller annan webbläsare med ett **annat namn**. Resultatet ska uppdateras på båda enheterna.
5. Lägg till ett nytt lunchställe under **Saknas ditt favoritställe?**. Det ska synas i listan på båda enheterna.
6. Kontrollera att **Vecka X** syns och att du kan växla mellan måndag och fredag.

## Om något inte fungerar

- **Står det att konfiguration saknas?** Kontrollera att `firebase-config.js` innehåller dina riktiga Firebase-värden och att GitHub har den nya filen.
- **Anonym inloggning misslyckades?** Kontrollera steg 4 och aktivera Anonymous.
- **Permission denied / otillåten åtgärd?** Kontrollera att du publicerade reglerna i steg 5 i rätt Firestore-databas.
- **404 på hemsidan?** Se till att `index.html` ligger direkt i repositoryts rot och att Pages använder `main` och `/(root)`.
- **Förslag syns men röstning fungerar inte?** Kontrollera Firestore-regler och att du inte redan röstat under samma namn samma dag.
- **Sidan laddas men är inte uppdaterad?** Gör en hård uppdatering eller kontrollera att filändringarna har committats på GitHub.

## Så ändrar du restauranglistan senare

- **Lägga till ställen:** skriv ett namn i formuläret **Saknas ditt favoritställe?** på hemsidan och klicka **Lägg till ställe**. Alla ser förslaget direkt.
- **Ta bort eget förslag:** öppna **Hantera egna förslag** på samma webbläsare som lade till förslaget.
- **Ändra de fem förinstallerade ställena:** på GitHub öppnar du `app.js`, trycker pennan (**Edit**) och ändrar namnen i `DEFAULT_PLACES`, därefter **Commit changes**. Ändra helst bara texten efter `name:` och inte `id:`.
- **Hantera andras förslag:** görs i Firebase Console under Firestore → `restaurants` (det finns ingen administratörsinloggning i denna version).

## Veckor, namn och begränsningar

- Måndag–fredag används aktuellt ISO-veckonummer enligt svensk tid. På lördag/söndag visas **kommande vecka**. Den nya veckans resultat är automatiskt noll utan att någon server behöver köra en nollställning. Tidigare data finns kvar som historik i Firestore och tar fortfarande lagringsutrymme.
- Varje normaliserat namn får **en röst per dag**. Samma stavning av namn blockerar en andra röst, även från andra enheter. Två personer med samma namn kan använda t.ex. `Anna A` och `Anna B`.
- Det går **inte att bevisa personens identitet** bara med ett namn. Man kan rösta flera gånger under olika namn. För verkligt en röst per person krävs verifierad inloggning.
- Hemsidan är **publik** och vem som helst som känner till länken kan rösta eller föreslå ställen. Använd inte känsliga personuppgifter.
- Gratiskvoter för Firebase och GitHub gäller och kan ändras. Kontrollera förbrukningen i Firebase Console. Den här lösningen kräver normalt inga betaluppgifter för en liten grupp, men kostnadsfri drift garanteras inte vid godtyckligt hög användning.
- Ta helst inte bort ett ställe mitt under en omröstning; tidigare röster på borttagna ställen ligger kvar i totalantalet men syns inte längre i listan.

Officiell dokumentation: https://firebase.google.com/docs/firestore/security/get-started och https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
