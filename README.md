# Bambu Lab Print Manager

Prywatny, uniwersalny system firmowych zgłoszeń druku 3D. Formularz pracownika, siedmiostopniowy Kanban, przypisania operatorów i drukarek, harmonogram, załączniki, historia zmian i tryb jasny / ciemny. Interfejs po polsku.

## Uruchomienie w LAN — jedno polecenie

Wymagany Docker z Compose. Rozpakuj paczkę, otwórz terminal w jej katalogu i uruchom:

```sh
docker compose up -d --build
```

Otwórz `http://localhost:3000`. Przy pierwszym wejściu utwórz administratora (hasło minimum 10 znaków). Nie ma domyślnego hasła. W **Zespół i konta** dodaj pracowników i operatorów. Na komputerach i tabletach w tej samej sieci otwieraj `http://ADRES_IP_SERWERA:3000`, np. `http://192.168.1.50:3000`. Serwer nasłuchuje na `0.0.0.0`. W zaporze systemu dopuść port TCP 3000 dla firmowej podsieci. Nie przekierowuj tego portu w routerze do Internetu. Dla dostępu poza zaufaną siecią skonfiguruj firmowy reverse proxy z HTTPS lub VPN.

Zmiana portu: `PRINT_MANAGER_PORT=3080 docker compose up -d --build` (Linux/macOS) albo ustaw zmienną `PRINT_MANAGER_PORT` w terminalu lub pliku `.env`. Zatrzymanie: `docker compose down`. Nie używaj `down -v`, jeśli chcesz zachować dane.

## Bez Dockera

Wymagany Node.js 24 LTS. Backend korzysta z wbudowanych modułów `node:http` i `node:sqlite`; nie wymaga instalacji pakietów.

```sh
node lan/server.mjs
```

Opcje: `PORT` (3000), `HOST` (0.0.0.0), `DATA_DIR` (katalog `data/`). Dane: `print-manager.sqlite` oraz katalog `uploads/`. SQLite pracuje w trybie WAL; migracje stosowane są automatycznie przy uruchomieniu.

## Role

- Pracownik: tworzy i przegląda własne zlecenia, pobiera pliki; dodaje i usuwa załączniki w statusie Zgłoszone / Oczekuje.
- Operator: wszystkie zgłoszenia, zmiany statusów, przypisywanie operatorów i drukarek, rezerwacje, notatki, czas, zużycie filamentu, profile i zarządzanie flotą.
- Administrator: uprawnienia operatora oraz konta, role, wyłączanie kont i resetowanie haseł. System chroni ostatnie aktywne konto administratora.

Konta pracowników tworzy administrator, co ogranicza dostęp do wskazanych osób w firmie. Sesje wygasają po 12 godzinach. Hasła są haszowane PBKDF2-SHA256 z indywidualną solą. W LAN przez zwykły HTTP ruch nie jest szyfrowany — stosuj zaufaną podsieć lub firmowy HTTPS.

## Obsługa

1. Pracownik dodaje nazwę, kategorię, osobę zlecającą, opis, materiał, kolor, wypełnienie i wymagania. Termin, wymiary, linki i pliki są opcjonalne.
2. Operator otwiera kartę, sprawdza załączniki, przypisuje siebie i drukarkę. Może wpisać gabaryty elementu (X/Y/Z w mm), ale nie jest to wymagane.
3. Harmonogram rezerwuje przedział od–do. System blokuje nakładające się rezerwacje tej samej drukarki, z wyjątkiem zleceń zakończonych. Stykające się terminy są dozwolone.
4. Etapy: Zgłoszone → Oczekuje na plik / akceptację → Przygotowane do druku → W druku → Kontrola jakości / obróbka → Do odbioru → Zakończone. Status można zmienić z karty lub przez przeciągnięcie na Kanbanie; na tablecie korzystaj z karty.
5. Rozpoczęcie druku wymaga operatora i gotowej drukarki. Wymiary są opcjonalne na każdym etapie; podane pełne gabaryty muszą pasować do drukarki. Jedna drukarka może mieć tylko jedno zlecenie w statusie W druku.
6. Zapis operatora jest jawny (przycisk Zapisz zmiany). Zmiany innej osoby powodują konflikt wersji zamiast nadpisania danych. Użyj Odśwież podgląd, aby wczytać aktualny zapis.

Dozwolone załączniki: STL, STEP/STP, OBJ, 3MF, PDF, PNG, JPG/JPEG, WEBP i GIF. Limit: 8 plików po maks. 20 MiB. Pliki pobiera się z karty; obrazy mają miniatury. Jeśli plik nie przejdzie weryfikacji, zgłoszenie pozostaje zapisane, a komunikat wskazuje pliki do ponownego dodania.

Parametry floty startowej: X1C i P1S 256 × 256 × 256 mm; A1 mini 180 × 180 × 180 mm. To edytowalne profile, nie wykryte fizyczne urządzenia. Oficjalne źródła: https://bambulab.com/en/x1/tech-specs, https://eu.store.bambulab.com/products/p1s, https://bambulab.com/en/a1-mini/tech-specs.

Weryfikacja gabarytów jest obliczana z podanych wymiarów (obrót XY o 90°, stała oś Z), nie przez analizę geometrii pliku. Przed drukiem sprawdź wszystkie części, brim, podpory i wyłączone obszary w slicerze. Wiele części można opisać w notatkach lub rozdzielić na osobne zgłoszenia. To system zarządzania pracą: nie łączy się bezpośrednio z firmware drukarek, nie wysyła G-code, nie zastępuje Bambu Studio.

## Kopia zapasowa i aktualizacja

Przed aktualizacją zrób kopię całego wolumenu z bazą i plikami. Spójny backup: zatrzymaj aplikację (`docker compose stop`), skopiuj dane z wolumenu (np. przez Docker Desktop / firmowy backup), a potem `docker compose start`. W uruchomieniu bez Dockera zatrzymaj proces i skopiuj cały katalog `data/`, w tym SQLite/WAL, jeśli występuje. Odtwarzaj bazę i uploads razem. Wersja LAN i Sites mają osobne dane; nie synchronizują się automatycznie.

## Wersja Sites

Ten sam backend reguł i ten sam interfejs są wdrażane przez Vinext w Sites; dane strukturalne są w D1 (SQLite), załączniki w R2. Dostęp jest ograniczony polityką prywatnej strony. Tożsamość pochodzi z logowania ChatGPT; pierwsze konto jest administratorem, późniejsze konta domyślnie pracownikami. Przydział ról jest serwerowy. W Sites lokalne hasła nie są używane i nie tworzy się tam kont LAN. Udostępnienie kolejnym osobom wymaga osobnej zmiany dostępu strony przez właściciela. W tej wersji właściciel pozostaje jedyną osobą z dostępem.

## Testy

```sh
node --test tests/*.test.mjs
```

Testy integracyjne używają rzeczywistego SQLite i lokalnych plików oraz wykonują kompletne operacje API. Dodatkowy test HTTP uruchamia proces na porcie przydzielonym przez system. Szczegółowy wynik w `TESTY.md` w paczce. Lista zleceń w MVP obejmuje do 2000 najnowszych pozycji; historia karty pokazuje 100 ostatnich zdarzeń. Baza zachowuje starsze dane.

Brak zależności CDN: interfejs oraz wszystkie wymagane skrypty i style są lokalne. Do uruchomienia pobierany jest wyłącznie obraz bazowy Dockera. Prywatna wersja online i paczka LAN korzystają z tego samego kodu reguł biznesowych.


## Wersja 1.1 — wygodna praca zespołu

- Wymiary są opcjonalne przy zgłoszeniu, zmianie statusu i zapisywaniu notatek, także podczas druku. Częściowe wymiary nie blokują zapisu; dopasowanie liczy się tylko dla pełnego kompletu X/Y/Z. Pominięcie pola `dims` w API zachowuje poprzednią wartość.
- Administrator usuwa zlecenie przez menu ⋯ w tabeli. Pola wyboru pozwalają zaznaczyć wiele pozycji albo wszystkie widoczne po filtrowaniu. Potwierdzenie pokazuje liczbę zleceń. Zmiana filtrów usuwa niewidoczne pozycje z zaznaczenia.
- Usuwanie jest trwałe, obejmuje historię i załączniki. Aktualnie drukowane zlecenie trzeba najpierw zatrzymać w rzeczywistości i zmienić jego status. Nieaktualna wersja zlecenia jest chroniona przed usunięciem. Przy operacji zbiorczej każda pozycja ma osobny wynik, a błędy są wyświetlane.
- Możesz utworzyć trzech (lub więcej) administratorów w „Zespół i konta”. Konta są osobiste. Rola administratora aplikacji nie nadaje dostępu do repozytorium Git.
- Wdrożenie z repozytorium i praca trzech osób nad kodem: zobacz `WDROZENIE_GIT.md`.

## Aktualizacja obecnej wersji Windows

Zatrzymaj aplikację (Ctrl+C), wykonaj kopię całego folderu `data`, a następnie podmień foldery `engine`, `lan`, `public`, `tests` oraz dokumentację z nowej paczki. Zachowaj istniejący folder `data` i pliki migracji w `drizzle`. Uruchom ponownie `node lan/server.mjs` i odśwież przeglądarkę Ctrl+F5. Wersja 1.1 nie wymaga migracji bazy.
