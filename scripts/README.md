# Köra appen på en annan dator

Appen finns alltid i senaste pushade version på
<https://mattias1970.github.io/classroom-planner/studio/> — där behövs inget installeras.

Vill du köra den lokalt (t.ex. utan internet, eller för att dela den på skolans nätverk)
behövs Git och Node.js 22. Första gången på en ny dator, i PowerShell:

```powershell
cd $HOME\Code
git clone https://github.com/Mattias1970/classroom-planner.git
cd classroom-planner
git checkout utveckling
.\scripts\starta-appen.ps1
```

Nästa gång räcker `.\scripts\starta-appen.ps1` — skriptet hämtar senaste version,
installerar och startar appen på <http://localhost:4173/>. Andra datorer på samma nätverk
når den via din dators IP-adress, t.ex. `http://192.168.1.23:4173/` (IP-adressen visas
när appen startar).

Data (elever, planeringar, resultat) ligger i webbläsaren på den dator där de skrevs in.
Flytta dem med **☁ Datarepo (GitHub)** i appen, eller ta en **⬇ Backup** och läs in den
med **⬆ Återställ** på den andra datorn.
