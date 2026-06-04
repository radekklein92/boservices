# Zvuky ohňostroje

Oslavný ohňostroj na Dashboardu (`FireworksCelebration`) přehrává tyto zvuky
výbuchu (náhodně jeden z nich při každé explozi), když uživatel zapne zvuk
ikonou reproduktoru vpravo nahoře:

- `firework-1.mp3`
- `firework-2.mp3`
- `firework-3.mp3`

Zvuk se nezapíná automaticky - prohlížeče blokují autoplay se zvukem bez
interakce uživatele. Hlasitost je v komponentě nízká (`volume 6-16`).

Zdroj zvuků: ukázkové soubory z knihovny `fireworks-js`
(github.com/crashmax-dev/fireworks-js, MIT).
