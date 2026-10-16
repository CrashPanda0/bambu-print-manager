# Git i hosting — praca trzech administratorów

## Co jest gotowe

Kod, Dockerfile, docker-compose.yml, testy SQLite/API/HTTP i workflow GitHub Actions (`.github/workflows/test.yml`). Workflow uruchamia testy oraz buduje obraz Docker przy push i pull request. Nie publikuje aplikacji ani danych. Trzech administratorów aplikacji jest obsługiwanych bez zmiany kodu; administratorów kodu dodaje się osobno w repozytorium.

Obecna wersja Sites jest już hostowana poza komputerem właściciela i ma własne repozytorium źródłowe Git. To nie jest repozytorium na Twoim GitHubie. Ta paczka zawiera przenośny backend Node.js/SQLite i może posłużyć do utworzenia firmowego repozytorium GitHub/GitLab. Bazy Sites i wersji przenośnej nie synchronizują się automatycznie.

## Pierwsze repozytorium

1. Utwórz puste prywatne repozytorium, np. `bambu-print-manager`, na koncie firmy lub swoim. Nie inicjalizuj go dodatkowym README.
2. Rozpakuj paczkę, otwórz terminal w folderze z Dockerfile i wykonaj:

```sh
git init -b main
git add .
git commit -m "Print Manager 1.1: optional dimensions and job deletion"
git remote add origin https://github.com/OWNER/bambu-print-manager.git
git push -u origin main
```

Zastąp OWNER właścicielem repozytorium. Uwierzytelnij się własnym kontem GitHub; nie wpisuj tokenów w plikach ani w adresie remote.

3. W ustawieniach dostępu repozytorium dodaj pozostałe dwie osoby. Do zmieniania kodu wystarcza rola Write; Admin daje dodatkowo zarządzanie repozytorium. Wybierz zgodnie z faktycznym podziałem obowiązków.
4. Ustalcie pracę na gałęziach i pull requestach. Włącz ochronę `main` z wymaganym zaliczeniem testów i przeglądem drugiej osoby, jeśli używany plan to obsługuje.
5. Każda osoba klonuje repozytorium, tworzy gałąź, wprowadza zmiany, uruchamia testy i otwiera pull request. Zmiany trafiają na serwer po scaleniu i wdrożeniu.

## Gdzie uruchomić aplikację

GitHub Pages obsługuje statyczny frontend. Ta aplikacja wymaga działającego backendu i trwałego dysku na SQLite oraz załączniki. Sam push kodu do GitHub nie uruchomi serwera.

Wybierz zarządzany hosting Docker z trwałym dyskiem, HTTPS i integracją z repozytorium lub firmowy serwer zarządzany przez IT. Przy hostingu zewnętrznym konieczne jest konto dostawcy i wybór planu; nie uruchomiono żadnej płatnej usługi w ramach tej aktualizacji.

Wymagania wdrożenia:
- polecenie startowe jest już w Dockerfile;
- jedna instancja aplikacji (SQLite), port wewnętrzny 3000;
- trwały wolumin `/app/data`, zawierający bazę i załączniki;
- reverse proxy z HTTPS i poprawnie skonfigurowanym publicznym adresem;
- kopie zapasowe całego woluminu po zatrzymaniu usługi;
- przed udostępnieniem strony osobom trzecim skonfiguruj pierwszego administratora na prywatnym uruchomieniu; nie zostawiaj publicznego formularza pierwszej konfiguracji bez opieki;
- przy reverse proxy ustaw zmienną `APP_ORIGIN` na dokładny adres HTTPS aplikacji, bez ścieżki, np. `https://druk3d.twoja-firma.pl`;
- baza, załączniki i sekrety pozostają poza Git. `.gitignore` wyklucza dane i pliki środowiskowe.

Nie używaj nietrwałego dysku hostingu do danych — restart lub wdrożenie mogłyby je usunąć. Ustaw automatyczne wdrażanie `main` po zaliczeniu CI, jeśli dostawca to wspiera. Każde wdrożenie może krótko przerwać dostęp; wolumin musi być zachowany.

Na serwerze Docker aktualizację wykonuje się po kopii zapasowej:

```sh
git pull --ff-only
docker compose up -d --build
```

Nie używaj `docker compose down -v`: usuwa wolumin z danymi. Automatyczny pipeline do konkretnego hostingu konfiguruje się dopiero po wyborze dostawcy i repozytorium.

## Konta i dostęp z dowolnego miejsca

W aplikacji: Zespół i konta → Dodaj konto → Administrator. Dodaj dwa osobne konta, aby wraz z właścicielem były trzy. W Sites najpierw trzeba nadać osobom dostęp do strony; ich konta pojawią się po pierwszym logowaniu i wtedy można zmienić rolę na Administrator.

Domena `.local` jest zarezerwowana dla lokalnego mDNS i nie nadaje się do dostępu z internetu. Do dostępu z domu i pracy użyj subdomeny posiadanej domeny firmy, np. `druk3d.twoja-firma.pl`, wskazującej hosting HTTPS. Aplikacja wymaga logowania. Alternatywa wewnętrzna: DNS firmowy + VPN dla osób poza firmą. Nazwa lokalna nie omija podziału na VLAN-y.

## Źródła

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://www.rfc-editor.org/rfc/rfc6762
- https://render.com/docs/disks (przykład zasad trwałego dysku; nie wdrożono tam aplikacji)
