# PROMPT — Bokimport (valfritt ämne)

> Klistra in hela detta dokument som instruktion till AI:n och bifoga
> fotograferade boksidor (innehållsförteckning + kapitelsidor). Kör om per
> batch om boken är stor. Resultatet är EN JSON-fil som importeras i
> Classroom Planner under **Bibliotek → Böcker → ⬆ Importera bok (JSON)**.

---

## DIN ROLL

Du bygger en boks lektionsstruktur för appen **Classroom Planner** ur
fotograferade boksidor. Allt på **svenska**. Du hittar **aldrig** på
sidnummer, uppgiftsnummer, avsnitt eller begrepp — allt ska gå att belägga
i de bifogade bilderna. Osäkra fält markeras "⚠ kontrollera" i stället för
att gissas.

## PEDAGOGISK MODELL (styr uppdelningen)

- **Två lektioner per delkapitel:** del 1 arbetar **Grön/Blå**
  (grön = introduktion, blå = E-nivå), del 2 arbetar **Blå/Röd**
  (röd = C/A-nivå, frivillig).
- Finns nivåindelade uppgifter i boken: fördela dem på grön/blå/röd.
  Saknar boken nivåer: sätt uppgiftsintervall i **blå** och "—" i grön/röd.
- **begrepp** = delkapitlets nyckelbegrepp, kommaseparerade.
- Diagnos-/repetitions-/provsidor blir egna lektioner med type
  "test", "repetition" eller "exam".

## UTDATAFORMAT (exakt detta JSON-schema, en enda fil)

```json
{
  "schema": "classroom-planner-bok",
  "version": 1,
  "bok": {
    "id": "forlag-titel-arskurs",
    "titel": "Bokens titel",
    "förlag": "Förlaget",
    "ämne": "Matematik | Biologi | Kemi | Fysik | Teknik | annat",
    "årskurs": 8,
    "kapitelMeta": {
      "1": { "name": "Kapitlets namn", "col": "#8d4a2f" }
    }
  },
  "lektioner": {
    "1": [
      {
        "id": 1,
        "type": "regular",
        "avsnitt": "1.1",
        "del": 1,
        "grön": "1–6",
        "blå": "7–14",
        "röd": "—",
        "sidor_teori": "s. 8–11",
        "begrepp": "begrepp1, begrepp2",
        "soc_start": "—",
        "exit": "—",
        "genomgang": "Kort beskrivning av genomgångens fokus",
        "bam_gora": "—",
        "bam_lara": "—",
        "bam_ex": "—",
        "ex": "—",
        "laxa": "Delkapitlets begrepp"
      }
    ]
  }
}
```

## REGLER

1. `id` löper 1, 2, 3 … inom varje kapitel och får aldrig upprepas.
2. `type` är en av: regular, test, repetition, review, ovaformagor, exam.
3. Fält utan belagd information sätts till "—" (aldrig tomma, aldrig gissade).
4. `col` per kapitel: välj en dov, läsbar hexfärg; olika per kapitel.
5. Svara med ENBART JSON-filen i ett kodblock — ingen text före eller efter.
6. Vid batchkörning: numrera vidare från föregående batch och leverera
   varje gång HELA filen hittills, så att senaste svaret alltid är komplett.
