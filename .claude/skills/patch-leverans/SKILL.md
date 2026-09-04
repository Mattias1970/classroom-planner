---
name: patch-leverans
description: Leveransflödet för Classroom Planner — git format-patch, git am i PowerShell på Windows och felsökning av konflikter. Använd när en ändring ska levereras till användaren, när en patch ska byggas, eller när git am misslyckas med konflikt, .git/rebase-apply eller CRLF-problem.
---

# Leverans som patch

Ändringar levereras som en `git format-patch`-fil som användaren applicerar med `git am` i PowerShell på `C:\Users\mterf\Code\classroom-planner`.

## Bygga patchen

```bash
git add -A
git -c user.name="Claude" -c user.email="claude@anthropic.com" commit -m "Del NN: <rubrik>

- kernel: <vad>
- studio: <vad>"
git format-patch -1 -o /tmp/ut
```

- Ett **Del-nummer** per leverans, i stigande ordning. Skriv alltid ut vilken Del patchen bygger på.
- Committexten på svenska utan å/ä/ö i ämnesraden (undviker teckenproblem i PowerShell), punktlista över kernel- respektive studio-ändringar.
- `package-lock.json` ska inte ingå. Kontrollera med `grep -c package-lock` på patchen.
- Kör hela kvalitetskedjan (lint, typecheck, vitest, vite build) **före** commit.

## Applicera (användarens sida)

```powershell
cd C:\Users\mterf\Code\classroom-planner
git checkout utveckling
git am --3way $HOME\Downloads\delNN-<namn>.patch
npm run test
```

En rad i taget — hopklistrade rader ger fel av typen `Missing script: "testgit"`.

## När det går fel

| Symtom | Åtgärd |
|---|---|
| `previous rebase directory .git/rebase-apply still exists` | `git am --abort` innan nytt försök |
| add/add-konflikt på en fil patchen skapar | patchen är redan applicerad — kontrollera `git log --oneline` |
| Konfliktmarkörer kvar efter avbrott | `git am --abort` och vid behov `git checkout -- .` |
| CRLF/LF-strul | `git am --3way` löser oftast; annars `--exclude=package-lock.json` följt av `npm install` |
| EPERM vid `npm ci` | `taskkill /F /IM node.exe /T` — Vite låser filer |

Applicera alltid patchar i nummerordning; de bygger på varandra.
